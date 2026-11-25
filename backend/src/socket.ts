import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyToken } from "./utils/jwt.js";
import { prisma } from "./config/prisma.js";
import { toggleMessageReaction } from "./modules/messenger/reactions.js";

interface AuthenticatedSocket extends Socket {
  userId?: number;
  userName?: string;
}

const onlineUsers = new Map<number, Set<string>>();
// In-memory set of user IDs currently sharing screen per active callSessionId (supports multi-screen sharing)
const activeScreenSharersBySession = new Map<number, Set<number>>();
let ioInstance: Server | null = null;

// In-memory cache of verified active call participants to eliminate DB race condition packet drops
const activeCallParticipantsInMemory = new Map<number, Set<number>>();

async function canSignalCallParticipant(
  callSessionId: number,
  senderUserId: number,
  targetUserId: number
): Promise<boolean> {
  const inMemory = activeCallParticipantsInMemory.get(callSessionId);
  if (inMemory && inMemory.has(senderUserId) && inMemory.has(targetUserId)) {
    return true;
  }
  const session = await prisma.callSession.findUnique({
    where: { id: callSessionId },
    select: {
      status: true,
      hostId: true,
      participants: {
        where: {
          userId: { in: [senderUserId, targetUserId] },
        },
        select: { userId: true, status: true },
      },
    },
  });
  if (!session || session.status === "ENDED" || session.status === "REJECTED") return false;
  const participants = session.participants;
  const senderValid = session.hostId === senderUserId || participants.some((participant) => participant.userId === senderUserId);
  const targetValid = session.hostId === targetUserId || participants.some((participant) => participant.userId === targetUserId);
  if (senderValid && targetValid) {
    if (!activeCallParticipantsInMemory.has(callSessionId)) {
      activeCallParticipantsInMemory.set(callSessionId, new Set());
    }
    activeCallParticipantsInMemory.get(callSessionId)!.add(senderUserId);
    activeCallParticipantsInMemory.get(callSessionId)!.add(targetUserId);
    return true;
  }
  return false;
}

export function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
    transports: ["polling", "websocket"],
    allowUpgrades: true,
    pingTimeout: 30000,
    pingInterval: 25000,
  });
  ioInstance = io;

  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        console.warn(`[Socket.IO] Auth rejected: No token provided (${socket.id})`);
        return next(new Error("Authentication token required"));
      }

      const decoded = verifyToken(token);
      socket.userId = decoded.userId;
      next();
    } catch (err: any) {
      console.warn(`[Socket.IO] Auth rejected: ${err?.message || "Invalid token"} (${socket.id})`);
      next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", async (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    if (!userId) return;

    socket.on("error", (err) => {
      console.error(`[Socket.IO] Socket error (${socket.id}):`, err);
    });

    // Track online user sockets
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)?.add(socket.id);

    // Broadcast user online status
    io.emit("presence:update", {
      userId,
      isOnline: true,
      onlineUsers: Array.from(onlineUsers.keys()),
    });

    // Join user's personal room for direct signaling/notifications
    socket.join(`user_${userId}`);

    // Join user's existing conversation rooms
    try {
      const userConversations = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true },
      });

      userConversations.forEach((c: { conversationId: number }) => {
        socket.join(`conversation_${c.conversationId}`);
      });
    } catch (err) {
      console.error("Error joining user conversation rooms:", err);
    }

    // Handle Join Room
    socket.on("join:conversation", (conversationId: number) => {
      socket.join(`conversation_${conversationId}`);
    });

    // Handle Typing Status
    socket.on("typing:start", ({ conversationId }: { conversationId: number }) => {
      socket.to(`conversation_${conversationId}`).emit("user:typing", {
        conversationId,
        userId,
      });
    });

    socket.on("typing:stop", ({ conversationId }: { conversationId: number }) => {
      socket.to(`conversation_${conversationId}`).emit("user:stop_typing", {
        conversationId,
        userId,
      });
    });

    // Handle Real-time Message Reactions
    socket.on("message:react", async (data: { messageId: number; conversationId: number; emoji: string }) => {
      try {
        if (!data?.emoji || typeof data.emoji !== "string" || data.emoji.trim().length === 0 || data.emoji.length > 32) return;
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        });
        const updatedReactions = toggleMessageReaction(
          data.messageId,
          userId,
          user?.name || `User ${userId}`,
          data.emoji
        );
        io.to(`conversation_${data.conversationId}`).emit("message:reaction", {
          messageId: data.messageId,
          conversationId: data.conversationId,
          reactions: updatedReactions,
        });
      } catch (err) {
        console.error("Socket reaction error:", err);
      }
    });

    // Handle Real-time Conversation Read Receipts (Bitrix-style Seen Tracking)
    socket.on("conversation:read", async (data: { conversationId: number }) => {
      try {
        if (!data?.conversationId) return;
        const readAt = new Date();
        await prisma.conversationParticipant.updateMany({
          where: { conversationId: data.conversationId, userId },
          data: { lastReadAt: readAt },
        });

        const reader = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, designation: { select: { name: true } } },
        });

        io.to(`conversation_${data.conversationId}`).emit("conversation:seen", {
          conversationId: data.conversationId,
          userId,
          name: reader?.name || `User ${userId}`,
          designation: reader?.designation?.name || null,
          readAt: readAt.toISOString(),
        });

        io.to(`user_${userId}`).emit("conversation:marked-read", {
          conversationId: data.conversationId,
        });
      } catch (err) {
        console.error("Socket conversation:read error:", err);
      }
    });

    // WebRTC Signaling Events
    socket.on(
      "call:initiate",
      async (data: {
        targetUserId?: number;
        targetUserIds?: number[];
        conversationId?: number;
        type: "AUDIO" | "VIDEO";
        channelName: string;
      }, acknowledge?: (result: { callSessionId?: number; error?: string }) => void) => {
        try {
          const caller = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true },
          });
          if (!caller) {
            acknowledge?.({ error: "Caller not found" });
            return;
          }

          let targetUserIds: number[] = [];
          let conversationName: string | null = null;
          // Group call if explicitly targeted to multiple users, or if conversationId is provided without a single targetUserId
          const isGroupCall = Boolean(data.targetUserIds && data.targetUserIds.length > 0) || (!data.targetUserId && Boolean(data.conversationId));

          if (isGroupCall) {
            if (data.conversationId) {
              const conversation = await prisma.conversation.findUnique({
                where: { id: data.conversationId },
                select: {
                  type: true,
                  name: true,
                  participants: { select: { userId: true } },
                },
              });
              if (
                !conversation ||
                conversation.type !== "GROUP" ||
                !conversation.participants.some((participant) => participant.userId === userId)
              ) {
                acknowledge?.({ error: "You are not a member of this group" });
                return;
              }

              conversationName = conversation.name;
              targetUserIds = conversation.participants
                .map((participant) => participant.userId)
                .filter((participantId) => participantId !== userId);
              if (targetUserIds.length === 0) {
                acknowledge?.({ error: "Add another member before starting a group call" });
                return;
              }
            } else if (data.targetUserIds && data.targetUserIds.length > 0) {
              targetUserIds = data.targetUserIds.filter((pId) => pId !== userId);
              conversationName = data.channelName;
            }
          } else if (data.targetUserId && data.targetUserId !== userId) {
            targetUserIds = [data.targetUserId];
          } else if (
            data.channelName &&
            (data.channelName.startsWith("room-") ||
              data.channelName.startsWith("meeting-") ||
              data.channelName.startsWith("permanent-") ||
              data.channelName.includes("permanent"))
          ) {
            // Meeting room or permanent company room started by host waiting for participants to join
            targetUserIds = [];
          } else {
            acknowledge?.({ error: "Call recipient is required" });
            return;
          }

          // Check if an existing call session already exists on this channel (handles unique channelName constraint)
          let existingSession = await prisma.callSession.findFirst({
            where: {
              channelName: data.channelName,
            },
            include: { participants: true },
          });

          const isPermanent = Boolean(
            data.channelName &&
              (data.channelName.startsWith("permanent-") ||
                data.channelName.includes("permanent"))
          );

          const isSessionActive = Boolean(
            existingSession &&
              (existingSession.status === "ACTIVE" || existingSession.status === "RINGING")
          );

          if (isPermanent && !isSessionActive) {
            // Only ADMIN, SUPER_ADMIN, or HR can start/initiate the permanent meeting
            const callerUser = await prisma.user.findUnique({
              where: { id: userId },
              select: { role: { select: { name: true } } },
            });
            const roleName = (callerUser?.role?.name || "").toUpperCase();
            const canStart = roleName === "ADMIN" || roleName === "SUPER_ADMIN" || roleName === "HR";
            if (!canStart) {
              acknowledge?.({
                error: "The Daily Standup meeting has not been started yet. Please wait for an Admin or HR to begin the meeting.",
              });
              return;
            }
          }

          let session: any;

          if (existingSession) {
            if (existingSession.status === "ENDED" || existingSession.status === "REJECTED") {
              // Re-activate / reopen the existing session
              session = await prisma.callSession.update({
                where: { id: existingSession.id },
                data: {
                  status: "ACTIVE",
                  hostId: userId,
                  type: data.type,
                  startedAt: new Date(),
                  endedAt: null,
                },
                include: { participants: true },
              });

              // Reset previous participants
              await prisma.callParticipant.deleteMany({
                where: { callSessionId: session.id, userId: { not: userId } },
              }).catch(() => null);

              await prisma.callParticipant.upsert({
                where: { callSessionId_userId: { callSessionId: session.id, userId } },
                create: { callSessionId: session.id, userId, status: "ACCEPTED", joinedAt: new Date() },
                update: { status: "ACCEPTED", joinedAt: new Date(), leftAt: null },
              }).catch(() => null);

              if (isPermanent) {
                io.emit("standup:status", {
                  isLive: true,
                  callSessionId: session.id,
                  hostId: userId,
                  hostName: caller.name,
                  startedAt: new Date(),
                  participantsCount: 1,
                });
              }

              acknowledge?.({ callSessionId: session.id });
              return;
            } else {
              // Session is already ACTIVE/RINGING — add joining user
              session = existingSession;
              const existingPart = session.participants.find((p: any) => p.userId === userId);
              if (!existingPart) {
                await prisma.callParticipant.create({
                  data: {
                    callSessionId: session.id,
                    userId,
                    status: "ACCEPTED",
                    joinedAt: new Date(),
                  },
                }).catch(() => null);
              } else if (existingPart.status !== "ACCEPTED") {
                await prisma.callParticipant.update({
                  where: { callSessionId_userId: { callSessionId: session.id, userId } },
                  data: { status: "ACCEPTED", joinedAt: new Date() },
                }).catch(() => null);
              }

              socket.join(`call_${session.id}`);
              const acceptedParts = await prisma.callParticipant.findMany({
                where: { callSessionId: session.id, status: "ACCEPTED" },
                select: { userId: true },
              });
              const pIdSet = new Set<number>(acceptedParts.map((p) => p.userId));
              if (session.hostId) pIdSet.add(session.hostId);
              pIdSet.add(userId);
              const pIds = Array.from(pIdSet);
              const activeSharers = Array.from(activeScreenSharersBySession.get(session.id) || []);
              for (const pid of pIds) {
                io.to(`user_${pid}`).emit("call:participant-joined", {
                  callSessionId: session.id,
                  userId,
                  participantIds: pIds,
                  activeScreenSharerUserIds: activeSharers,
                });
              }
              io.to(`call_${session.id}`).emit("call:participant-joined", {
                callSessionId: session.id,
                userId,
                participantIds: pIds,
                activeScreenSharerUserIds: activeSharers,
              });

              if (isPermanent) {
                io.emit("standup:status", {
                  isLive: true,
                  callSessionId: session.id,
                  hostId: session.hostId,
                  participantsCount: pIds.length,
                });
              }

              acknowledge?.({ callSessionId: session.id });
              return;
            }
          }

          // If no session existed at all on this channelName, create brand new one:
          session = await prisma.callSession.create({
            data: {
              channelName: data.channelName,
              conversationId: data.conversationId || null,
              hostId: userId,
              type: data.type,
              status: "ACTIVE",
              participants: {
                create: [
                  { userId, status: "ACCEPTED", joinedAt: new Date() },
                  ...targetUserIds.map((participantId) => ({
                    userId: participantId,
                    status: "INVITED",
                  })),
                ],
              },
            },
            include: { participants: true },
          });

          if (isPermanent) {
            io.emit("standup:status", {
              isLive: true,
              callSessionId: session.id,
              hostId: userId,
              hostName: caller.name,
              startedAt: new Date(),
              participantsCount: 1,
            });
          }

          for (const targetUserId of targetUserIds) {
            io.to(`user_${targetUserId}`).emit("incoming:call", {
              callSessionId: session.id,
              channelName: data.channelName,
              caller,
              type: data.type,
              conversationId: data.conversationId,
              conversationName,
              isGroupCall,
              meetingId: (data as any).meetingId,
            });
          }

          // Bitrix-Style Activity: Post call started notification into conversation
          if (data.conversationId) {
            const callTypeLabel = data.type === "VIDEO" ? "video call" : "audio call";
            const callStartMsg = await prisma.message.create({
              data: {
                conversationId: data.conversationId,
                senderId: userId,
                content: `${caller.name} started a ${callTypeLabel}`,
                attachmentType: "CALL",
              },
              include: {
                sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
              },
            }).catch(() => null);

            if (callStartMsg) {
              const allParticipants = [userId, ...targetUserIds];
              for (const pid of allParticipants) {
                io.to(`user_${pid}`).emit("message:new", callStartMsg);
              }
            }
          }

          acknowledge?.({ callSessionId: session.id });
        } catch (error) {
          console.error("Call initiation error:", error);
          acknowledge?.({ error: "Unable to start call" });
        }
      }
    );

    socket.on(
      "call:invite",
      async (
        data: { callSessionId: number; targetUserId: number },
        acknowledge?: (result: { success?: boolean; error?: string }) => void
      ) => {
        try {
          const { callSessionId, targetUserId } = data;
          if (!callSessionId || !targetUserId) {
            acknowledge?.({ error: "Call session ID and target user ID are required" });
            return;
          }

          if (targetUserId === userId) {
            acknowledge?.({ error: "You cannot invite yourself" });
            return;
          }

          const inviter = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true },
          });
          if (!inviter) {
            acknowledge?.({ error: "Inviter not found" });
            return;
          }

          const invitedUser = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, name: true, email: true },
          });
          if (!invitedUser) {
            acknowledge?.({ error: "User to invite not found" });
            return;
          }

          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: {
              participants: true,
              conversation: { select: { name: true } },
            },
          });

          if (!session || (session.status !== "ACTIVE" && session.status !== "RINGING")) {
            acknowledge?.({ error: "Active call session not found" });
            return;
          }

          // Check if inviter is part of this call
          const isParticipant = session.participants.some(
            (p) => p.userId === userId && (p.status === "ACCEPTED" || session.hostId === userId)
          );
          if (!isParticipant) {
            acknowledge?.({ error: "You are not an active participant of this call" });
            return;
          }

          // Check if already in call
          const existingParticipant = session.participants.find((p) => p.userId === targetUserId);
          if (existingParticipant && existingParticipant.status === "ACCEPTED") {
            acknowledge?.({ error: "User is already connected in this call" });
            return;
          }

          // Upsert CallParticipant
          await prisma.callParticipant.upsert({
            where: {
              callSessionId_userId: {
                callSessionId,
                userId: targetUserId,
              },
            },
            create: {
              callSessionId,
              userId: targetUserId,
              status: "INVITED",
            },
            update: {
              status: "INVITED",
              joinedAt: null,
              leftAt: null,
            },
          });

          // Send incoming call to the invited user
          io.to(`user_${targetUserId}`).emit("incoming:call", {
            callSessionId: session.id,
            channelName: session.channelName,
            caller: inviter,
            type: session.type,
            conversationId: session.conversationId,
            conversationName: session.conversation?.name || "Group Call",
            isGroupCall: true,
          });

          // Inform all current accepted participants that an invitation was sent
          const acceptedParticipants = session.participants.filter(
            (p) => p.status === "ACCEPTED"
          );
          for (const p of acceptedParticipants) {
            io.to(`user_${p.userId}`).emit("call:participant-invited", {
              callSessionId: session.id,
              invitedUserId: targetUserId,
              invitedUser,
              invitedBy: inviter,
            });
          }

          acknowledge?.({ success: true });
        } catch (error) {
          console.error("Call invitation error:", error);
          acknowledge?.({ error: "Failed to invite user to call" });
        }
      }
    );

    socket.on("call:accept", async ({ callSessionId }: { callSessionId: number }) => {
      try {
        const session = await prisma.callSession.findUnique({
          where: { id: callSessionId },
          include: { participants: { select: { userId: true, status: true } } },
        });
        if (
          !session ||
          (session.status !== "RINGING" && session.status !== "ACTIVE") ||
          !session.participants.some(
            (participant) => participant.userId === userId && participant.status === "INVITED"
          )
        ) return;

        await prisma.$transaction([
          prisma.callParticipant.update({
            where: { callSessionId_userId: { callSessionId, userId } },
            data: { status: "ACCEPTED", joinedAt: new Date() },
          }),
          prisma.callSession.update({
            where: { id: callSessionId },
            data: { status: "ACTIVE", startedAt: session.startedAt || new Date() },
          }),
        ]);

        const acceptedParticipants = await prisma.callParticipant.findMany({
          where: { callSessionId, status: "ACCEPTED" },
          select: { userId: true },
        });
        const participantIds = acceptedParticipants.map((participant) => participant.userId);
        for (const participantId of participantIds) {
          io.to(`user_${participantId}`).emit("call:participant-joined", {
            callSessionId,
            userId,
            participantIds,
          });
        }

        if (session.channelName === "permanent-daily-standup" || session.channelName.startsWith("permanent-")) {
          io.emit("standup:status", {
            isLive: true,
            callSessionId: session.id,
            hostId: session.hostId,
            participantsCount: participantIds.length,
          });
        }
        io.to(`user_${session.hostId}`).emit("call:accepted", { callSessionId, userId });
      } catch (error) {
        console.error("Call acceptance error:", error);
      }
    });

    socket.on("call:join", async ({ callSessionId }: { callSessionId: number }) => {
      try {
        const session = await prisma.callSession.findUnique({
          where: { id: callSessionId },
          include: { participants: true },
        });
        if (!session || session.status === "ENDED" || session.status === "REJECTED") return;

        // Ensure session is active once someone joins
        if (session.status === "RINGING") {
          await prisma.callSession.update({
            where: { id: callSessionId },
            data: { status: "ACTIVE", startedAt: session.startedAt || new Date() },
          }).catch(() => null);
        }

        // Upsert participant to ACCEPTED status so WebRTC signaling is immediately unlocked
        const existingParticipant = session.participants.find((p) => p.userId === userId);
        if (!existingParticipant) {
          await prisma.callParticipant.create({
            data: {
              callSessionId,
              userId,
              status: "ACCEPTED",
              joinedAt: new Date(),
            },
          }).catch(() => null);
        } else if (existingParticipant.status !== "ACCEPTED") {
          await prisma.callParticipant.update({
            where: { callSessionId_userId: { callSessionId, userId } },
            data: { status: "ACCEPTED", joinedAt: new Date() },
          }).catch(() => null);
        }

        socket.join(`call_${callSessionId}`);

        if (!activeCallParticipantsInMemory.has(callSessionId)) {
          activeCallParticipantsInMemory.set(callSessionId, new Set());
        }
        activeCallParticipantsInMemory.get(callSessionId)!.add(userId);
        if (session.hostId) {
          activeCallParticipantsInMemory.get(callSessionId)!.add(session.hostId);
        }

        const acceptedParticipants = await prisma.callParticipant.findMany({
          where: { callSessionId, status: "ACCEPTED" },
          select: { userId: true },
        });
        const participantIdSet = new Set<number>(acceptedParticipants.map((p) => p.userId));
        if (session.hostId) participantIdSet.add(session.hostId);
        participantIdSet.add(userId);
        const participantIds = Array.from(participantIdSet);
        const activeSharers = Array.from(activeScreenSharersBySession.get(callSessionId) || []);

        for (const participantId of participantIds) {
          io.to(`user_${participantId}`).emit("call:participant-joined", {
            callSessionId,
            userId,
            participantIds,
            activeScreenSharerUserIds: activeSharers,
          });
        }
        io.to(`call_${callSessionId}`).emit("call:participant-joined", {
          callSessionId,
          userId,
          participantIds,
          activeScreenSharerUserIds: activeSharers,
        });

        // Send currently active screen sharers directly to the joining user so they immediately see live presentations
        io.to(`user_${userId}`).emit("call:active-screen-shares", {
          callSessionId,
          sharerUserIds: activeSharers,
        });

        if (session.channelName === "permanent-daily-standup" || session.channelName.startsWith("permanent-")) {
          io.emit("standup:status", {
            isLive: true,
            callSessionId: session.id,
            hostId: session.hostId,
            participantsCount: participantIds.length,
          });
        }
      } catch (error) {
        console.error("Call join error:", error);
      }
    });

    socket.on("call:reject", async ({ callSessionId }: { callSessionId: number }) => {
      try {
        const participant = await prisma.callParticipant.findUnique({
          where: { callSessionId_userId: { callSessionId, userId } },
        });
        if (!participant || participant.status !== "INVITED") return;

        await prisma.callParticipant.update({
          where: { callSessionId_userId: { callSessionId, userId } },
          data: { status: "REJECTED", leftAt: new Date() },
        });
        const session = await prisma.callSession.findUnique({
          where: { id: callSessionId },
          include: { participants: { select: { userId: true } } },
        });
        if (!session) return;

        const isGroup = Boolean(
          session.conversationId ||
          session.channelName.startsWith("room-") ||
          session.channelName.startsWith("meeting-") ||
          session.channelName.startsWith("permanent-") ||
          session.channelName.includes("permanent") ||
          session.participants.length > 2
        );
        if (!isGroup) {
          await prisma.callSession.update({
            where: { id: callSessionId },
            data: { status: "REJECTED", endedAt: new Date() },
          });
        }
        io.to(`user_${session.hostId}`).emit("call:rejected", { callSessionId, userId });
      } catch (error) {
        console.error("Call rejection error:", error);
      }
    });

    socket.on(
      "call:leave",
      async ({ callSessionId }: { callSessionId: number }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: { select: { userId: true, status: true } } },
          });
          if (!session) return;

          await prisma.callParticipant.updateMany({
            where: { callSessionId, userId },
            data: { status: "LEFT", leftAt: new Date() },
          });

          for (const participant of session.participants) {
            if (participant.userId !== userId && participant.status !== "LEFT") {
              io.to(`user_${participant.userId}`).emit("call:participant-left", {
                callSessionId,
                userId,
              });
            }
          }

          // Clean up multi-screen sharing if leaving user was sharing
          const sharersSet = activeScreenSharersBySession.get(callSessionId);
          if (sharersSet && sharersSet.has(userId)) {
            sharersSet.delete(userId);
            if (sharersSet.size === 0) {
              activeScreenSharersBySession.delete(callSessionId);
            }
            const activeSharers = Array.from(activeScreenSharersBySession.get(callSessionId) || []);
            for (const participant of session.participants) {
              if (participant.userId !== userId && participant.status !== "LEFT") {
                io.to(`user_${participant.userId}`).emit("call:screen-share-stopped", {
                  callSessionId,
                  fromUserId: userId,
                  activeScreenSharerUserIds: activeSharers,
                });
              }
            }
          }

          if (session.channelName === "permanent-daily-standup" || session.channelName.startsWith("permanent-")) {
            const remaining = session.participants.filter(
              (p) => p.userId !== userId && p.status !== "LEFT"
            );
            if (remaining.length === 0) {
              await prisma.callSession.update({
                where: { id: callSessionId },
                data: { status: "ENDED", endedAt: new Date() },
              }).catch(() => null);
              io.emit("standup:status", { isLive: false });
            } else {
              io.emit("standup:status", {
                isLive: true,
                callSessionId: session.id,
                hostId: session.hostId,
                participantsCount: remaining.length,
              });
            }
          }
        } catch (error) {
          console.error("Call leave error:", error);
        }
      }
    );

    socket.on(
      "call:end",
      async ({ callSessionId, duration }: { callSessionId: number; duration?: number }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: { select: { userId: true, status: true } } },
          });
          if (!session || (!session.participants.some((participant) => participant.userId === userId) && session.hostId !== userId)) {
            return;
          }

          const isGroupOrMeeting =
            session.channelName.startsWith("room-") ||
            session.channelName.includes("permanent") ||
            session.channelName.startsWith("group-") ||
            session.channelName.startsWith("meeting-") ||
            session.participants.length > 2 ||
            Boolean(session.conversationId);

          // For group/meeting calls: Only the host/creator can end the call for everyone!
          // Non-hosts who hang up should only leave their own connection.
          // For direct 1-on-1 calls: either peer can hang up to end the call.
          const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: { select: { name: true } } },
          });
          const isAdminOrSuperAdmin = userRecord?.role?.name === "SUPER_ADMIN" || userRecord?.role?.name === "ADMIN";
          const isHost = session.hostId === userId || isAdminOrSuperAdmin;
          const activeParticipants = session.participants.filter((p) => p.status !== "LEFT");
          const shouldEndCall = isGroupOrMeeting ? isHost : (isHost || activeParticipants.length <= 2);

          if (shouldEndCall) {
            activeScreenSharersBySession.delete(callSessionId);
            await prisma.callSession.update({
              where: { id: callSessionId },
              data: { status: "ENDED", endedAt: new Date() },
            });

            if (session.channelName === "permanent-daily-standup" || session.channelName.startsWith("permanent-")) {
              io.emit("standup:status", { isLive: false });
            }

            // If this call was associated with a scheduled meeting, mark the meeting as COMPLETED
            // NOTE: Permanent company room (e.g. permanent-daily-standup) is NEVER marked as COMPLETED!
            const isPermanentRoom =
              session.channelName === "permanent-daily-standup" ||
              session.channelName.startsWith("permanent-");

            if (!isPermanentRoom) {
              try {
                let meetingToComplete = await prisma.meeting.findFirst({
                  where: { roomName: session.channelName },
                });
                if (!meetingToComplete && session.channelName.startsWith("meeting-")) {
                  const parsedId = Number(session.channelName.replace("meeting-", ""));
                  if (!isNaN(parsedId)) {
                    meetingToComplete = await prisma.meeting.findUnique({
                      where: { id: parsedId },
                    });
                  }
                }
                if (meetingToComplete && meetingToComplete.status !== "CANCELLED") {
                  const updatedMeeting = await prisma.meeting.update({
                    where: { id: meetingToComplete.id },
                    data: { status: "COMPLETED" },
                  });
                  io.emit("meeting:updated", {
                    meetingId: updatedMeeting.id,
                    status: "COMPLETED",
                    meeting: updatedMeeting,
                  });
                }
              } catch (err) {
                console.error("Meeting complete on call:end error:", err);
              }
            }

            // Bitrix-Style Activity: Post call summary with duration into conversation
            if (session.conversationId) {
              const callDurationSeconds = duration || (session.startedAt ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000) : 0);
              const minutes = Math.floor(callDurationSeconds / 60);
              const seconds = callDurationSeconds % 60;
              const durationText = callDurationSeconds > 0 ? `${minutes > 0 ? `${minutes}m ` : ""}${seconds}s` : "0s";
              const callTypeLabel = session.type === "VIDEO" ? "Video call" : "Audio call";

              const callEndMsg = await prisma.message.create({
                data: {
                  conversationId: session.conversationId,
                  senderId: session.hostId,
                  content: `${callTypeLabel} ended • ${durationText}`,
                  attachmentType: "CALL",
                },
                include: {
                  sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
                },
              }).catch(() => null);

              if (callEndMsg) {
                for (const participant of session.participants) {
                  io.to(`user_${participant.userId}`).emit("message:new", callEndMsg);
                }
              }
            }

            const endingUser = await prisma.user.findUnique({
              where: { id: userId },
              select: { name: true },
            });

            for (const participant of session.participants) {
              io.to(`user_${participant.userId}`).emit("call:ended", {
                callSessionId,
                endedBy: userId,
                endedByName: endingUser?.name || "The Host",
                channelName: session.channelName,
              });
            }
          } else {
            await prisma.callParticipant.update({
              where: { callSessionId_userId: { callSessionId, userId } },
              data: { status: "LEFT", leftAt: new Date() },
            });
            const targetUserIds = new Set<number>();
            if (session.hostId && session.hostId !== userId) {
              targetUserIds.add(session.hostId);
            }
            for (const participant of session.participants) {
              if (participant.userId !== userId) {
                targetUserIds.add(participant.userId);
              }
            }
            for (const targetId of targetUserIds) {
              io.to(`user_${targetId}`).emit("call:participant-left", {
                callSessionId,
                userId,
              });
            }
          }
        } catch (error) {
          console.error("Call end error:", error);
        }
      }
    );

    // Host Moderation: Mute a participant remotely
    socket.on(
      "call:mute-participant",
      async ({ callSessionId, targetUserId }: { callSessionId: number; targetUserId: number }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: true },
          });
          if (!session) return;

          const requester = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: { select: { name: true } }, name: true },
          });
          const isHost = session.hostId === userId || requester?.role?.name === "SUPER_ADMIN" || requester?.role?.name === "ADMIN";
          if (!isHost) return;

          io.to(`user_${targetUserId}`).emit("call:muted-by-host", {
            callSessionId,
            mutedBy: userId,
            mutedByName: requester?.name || "The Host",
          });
        } catch (error) {
          console.error("Host mute participant error:", error);
        }
      }
    );

    // Host Moderation: Remove / Kick a participant from the call
    socket.on(
      "call:kick-participant",
      async ({ callSessionId, targetUserId }: { callSessionId: number; targetUserId: number }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: true },
          });
          if (!session) return;

          const requester = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: { select: { name: true } }, name: true },
          });
          const isHost = session.hostId === userId || requester?.role?.name === "SUPER_ADMIN" || requester?.role?.name === "ADMIN";
          if (!isHost) return;

          // Mark the target participant as LEFT
          await prisma.callParticipant.updateMany({
            where: { callSessionId, userId: targetUserId },
            data: { status: "LEFT", leftAt: new Date() },
          });

          // Inform target user they were removed
          io.to(`user_${targetUserId}`).emit("call:kicked", {
            callSessionId,
            kickedBy: userId,
            kickedByName: requester?.name || "The Host",
            reason: "You have been removed from the meeting by the host.",
          });

          // Inform all active participants that target participant left
          for (const participant of session.participants) {
            io.to(`user_${participant.userId}`).emit("call:participant-left", {
              callSessionId,
              userId: targetUserId,
            });
          }
        } catch (error) {
          console.error("Host kick participant error:", error);
        }
      }
    );

    // Screen Share Signalling — broadcast to all participants in the call session with full multi-screen synchronization
    socket.on(
      "call:screen-share-started",
      async ({ callSessionId }: { callSessionId: number }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: true },
          });
          if (!session) return;

          // Register in multi-participant active screen sharers set
          if (!activeScreenSharersBySession.has(callSessionId)) {
            activeScreenSharersBySession.set(callSessionId, new Set());
          }
          activeScreenSharersBySession.get(callSessionId)!.add(userId);
          const activeSharers = Array.from(activeScreenSharersBySession.get(callSessionId) || []);

          const targetUserIds = new Set<number>();
          if (session.hostId && session.hostId !== userId) {
            targetUserIds.add(session.hostId);
          }
          for (const participant of session.participants) {
            if (participant.userId !== userId) {
              targetUserIds.add(participant.userId);
            }
          }
          for (const targetId of targetUserIds) {
            io.to(`user_${targetId}`).emit("call:screen-share-started", {
              callSessionId,
              fromUserId: userId,
              activeScreenSharerUserIds: activeSharers,
            });
          }
          io.to(`call_${callSessionId}`).emit("call:screen-share-started", {
            callSessionId,
            fromUserId: userId,
            activeScreenSharerUserIds: activeSharers,
          });
        } catch (err) {
          console.error("screen-share-started error:", err);
        }
      }
    );

    socket.on(
      "call:screen-share-stopped",
      async ({ callSessionId }: { callSessionId: number }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: true },
          });
          if (!session) return;

          // Remove from multi-participant active screen sharers set
          const sharersSet = activeScreenSharersBySession.get(callSessionId);
          if (sharersSet) {
            sharersSet.delete(userId);
            if (sharersSet.size === 0) {
              activeScreenSharersBySession.delete(callSessionId);
            }
          }
          const activeSharers = Array.from(activeScreenSharersBySession.get(callSessionId) || []);

          const targetUserIds = new Set<number>();
          if (session.hostId && session.hostId !== userId) {
            targetUserIds.add(session.hostId);
          }
          for (const participant of session.participants) {
            if (participant.userId !== userId) {
              targetUserIds.add(participant.userId);
            }
          }
          for (const targetId of targetUserIds) {
            io.to(`user_${targetId}`).emit("call:screen-share-stopped", {
              callSessionId,
              fromUserId: userId,
              activeScreenSharerUserIds: activeSharers,
            });
          }
          io.to(`call_${callSessionId}`).emit("call:screen-share-stopped", {
            callSessionId,
            fromUserId: userId,
            activeScreenSharerUserIds: activeSharers,
          });
        } catch (err) {
          console.error("screen-share-stopped error:", err);
        }
      }
    );

    // Zoom-Style Query: Request list of all currently active screen sharers (e.g. on join or re-sync)
    socket.on(
      "call:get-active-screen-shares",
      ({ callSessionId }: { callSessionId: number }) => {
        const activeSharers = Array.from(activeScreenSharersBySession.get(callSessionId) || []);
        socket.emit("call:active-screen-shares", {
          callSessionId,
          sharerUserIds: activeSharers,
        });
      }
    );

    // Camera / Video Toggle Signalling — informs participants immediately when someone turns camera on/off
    socket.on(
      "call:video-toggle",
      async ({ callSessionId, isVideoOff }: { callSessionId: number; isVideoOff: boolean }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: true },
          });
          if (!session) return;
          const targetUserIds = new Set<number>();
          if (session.hostId && session.hostId !== userId) {
            targetUserIds.add(session.hostId);
          }
          for (const participant of session.participants) {
            if (participant.userId !== userId) {
              targetUserIds.add(participant.userId);
            }
          }
          for (const targetId of targetUserIds) {
            io.to(`user_${targetId}`).emit("call:video-toggle", {
              callSessionId,
              fromUserId: userId,
              isVideoOff,
            });
          }
        } catch (err) {
          console.error("call:video-toggle error:", err);
        }
      }
    );

    // Zoom-Style In-Call Real-time Meeting Chat
    socket.on(
      "meeting:chat-send",
      async (data: { callSessionId: number; text: string }) => {
        try {
          if (!data?.callSessionId || !data?.text?.trim()) return;
          const session = await prisma.callSession.findUnique({
            where: { id: data.callSessionId },
            include: { participants: true },
          });
          if (!session) return;

          const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, avatarUrl: true },
          });

          const chatPayload = {
            id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            callSessionId: data.callSessionId,
            senderId: userId,
            senderName: sender?.name || "Participant",
            senderAvatar: sender?.avatarUrl || null,
            text: data.text.trim(),
            createdAt: new Date().toISOString(),
          };

          for (const participant of session.participants) {
            io.to(`user_${participant.userId}`).emit("meeting:chat-message", chatPayload);
          }
        } catch (err) {
          console.error("meeting:chat-send error:", err);
        }
      }
    );

    // WebRTC Peer Connection SDP Offer/Answer & ICE Candidates
    socket.on(
      "webrtc:offer",
      async ({ targetUserId, offer, callSessionId }: {
        targetUserId: number;
        offer: unknown;
        callSessionId?: number;
      }) => {
        if (callSessionId && !(await canSignalCallParticipant(callSessionId, userId, targetUserId))) return;
        io.to(`user_${targetUserId}`).emit("webrtc:offer", {
          fromUserId: userId,
          offer,
          callSessionId,
        });
      }
    );

    socket.on(
      "webrtc:answer",
      async ({ targetUserId, answer, callSessionId }: {
        targetUserId: number;
        answer: unknown;
        callSessionId?: number;
      }) => {
        if (callSessionId && !(await canSignalCallParticipant(callSessionId, userId, targetUserId))) return;
        io.to(`user_${targetUserId}`).emit("webrtc:answer", {
          fromUserId: userId,
          answer,
          callSessionId,
        });
      }
    );

    socket.on(
      "webrtc:ice-candidate",
      async ({ targetUserId, candidate, callSessionId }: {
        targetUserId: number;
        candidate: unknown;
        callSessionId?: number;
      }) => {
        if (callSessionId && !(await canSignalCallParticipant(callSessionId, userId, targetUserId))) return;
        io.to(`user_${targetUserId}`).emit("webrtc:ice-candidate", {
          fromUserId: userId,
          candidate,
          callSessionId,
        });
      }
    );

    // Query Live Standup Status on demand
    socket.on(
      "standup:get-status",
      async (acknowledge?: (result: {
        isLive: boolean;
        callSessionId?: number;
        hostId?: number;
        hostName?: string;
        participantsCount?: number;
      }) => void) => {
        try {
          const activeSession = await prisma.callSession.findFirst({
            where: {
              channelName: "permanent-daily-standup",
              status: { in: ["RINGING", "ACTIVE"] },
            },
            include: {
              host: { select: { id: true, name: true } },
              participants: {
                where: { status: "ACCEPTED" },
                select: { userId: true },
              },
            },
          });
          if (activeSession) {
            acknowledge?.({
              isLive: true,
              callSessionId: activeSession.id,
              hostId: activeSession.hostId,
              hostName: activeSession.host?.name || "Host",
              participantsCount: activeSession.participants.length,
            });
          } else {
            acknowledge?.({ isLive: false });
          }
        } catch {
          acknowledge?.({ isLive: false });
        }
      }
    );

    // Disconnect Handler
    socket.on("disconnect", () => {
      // Clean up multi-screen sharing if this user was actively sharing
      for (const [sId, sharers] of activeScreenSharersBySession.entries()) {
        if (sharers.has(userId)) {
          sharers.delete(userId);
          const remainingSharers = Array.from(sharers);
          if (remainingSharers.length === 0) {
            activeScreenSharersBySession.delete(sId);
          }
          io.to(`call_${sId}`).emit("call:screen-share-stopped", {
            callSessionId: sId,
            fromUserId: userId,
            activeScreenSharerUserIds: remainingSharers,
          });
          io.emit("call:screen-share-stopped", {
            callSessionId: sId,
            fromUserId: userId,
            activeScreenSharerUserIds: remainingSharers,
          });
        }
      }

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit("presence:update", {
            userId,
            isOnline: false,
            onlineUsers: Array.from(onlineUsers.keys()),
          });
        }
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error("Socket.io is not initialized!");
  }
  return ioInstance;
}

export function emitNotificationUpdate(userIds: number[]) {
  if (!ioInstance) return;
  for (const userId of new Set(userIds)) {
    ioInstance.to(`user_${userId}`).emit("notification:new");
  }
}

export function emitUserUpdated(user: {
  id: number;
  name?: string;
  email?: string;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
  role?: string;
  roleId?: number;
  designation?: string | null;
  designationId?: number | null;
  employeeProfile?: any;
  permissions?: string[];
}) {
  if (!ioInstance) return;
  // Send to user's personal room so their active browser session updates in real-time
  ioInstance.to(`user_${user.id}`).emit("user:updated", user);
  // Broadcast to all connected clients (e.g., admin viewing employee lists, messenger, directory)
  ioInstance.emit("employee:updated", user);
}
