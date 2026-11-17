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
let ioInstance: Server | null = null;

async function canSignalCallParticipant(
  callSessionId: number,
  senderUserId: number,
  targetUserId: number
): Promise<boolean> {
  const session = await prisma.callSession.findUnique({
    where: { id: callSessionId },
    select: {
      status: true,
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
  return participants.some((participant) => participant.userId === senderUserId) &&
    participants.some((participant) => participant.userId === targetUserId);
}

export function setupSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
    transports: ["websocket", "polling"],
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
          } else if (data.channelName && (data.channelName.startsWith("room-") || data.channelName.startsWith("meeting-"))) {
            // Meeting room started by host waiting for participants to join
            targetUserIds = [];
          } else {
            acknowledge?.({ error: "Call recipient is required" });
            return;
          }

          // Check if an active call session already exists on this channel (e.g. ongoing meeting or group call)
          let session = await prisma.callSession.findFirst({
            where: {
              channelName: data.channelName,
              status: { in: ["RINGING", "ACTIVE"] },
            },
            include: { participants: true },
          });

          if (session) {
            // Re-use existing session and add joining user as ACCEPTED
            const existingPart = session.participants.find((p) => p.userId === userId);
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
            acknowledge?.({ callSessionId: session.id });
            return;
          }

          session = await prisma.callSession.create({
            data: {
              channelName: data.channelName,
              conversationId: data.conversationId || null,
              hostId: userId,
              type: data.type,
              status: "RINGING",
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
      "call:end",
      async ({ callSessionId, duration }: { callSessionId: number; duration?: number }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: { select: { userId: true } } },
          });
          if (!session || !session.participants.some((participant) => participant.userId === userId)) {
            return;
          }

          const shouldEndCall = session.hostId === userId || session.participants.length <= 2;
          if (shouldEndCall) {
            await prisma.callSession.update({
              where: { id: callSessionId },
              data: { status: "ENDED", endedAt: new Date() },
            });

            // If this call was associated with a scheduled meeting, mark the meeting as COMPLETED
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

            for (const participant of session.participants) {
              io.to(`user_${participant.userId}`).emit("call:ended", {
                callSessionId,
                endedBy: userId,
              });
            }
          } else {
            await prisma.callParticipant.update({
              where: { callSessionId_userId: { callSessionId, userId } },
              data: { status: "LEFT", leftAt: new Date() },
            });
            for (const participant of session.participants) {
              if (participant.userId !== userId) {
                io.to(`user_${participant.userId}`).emit("call:participant-left", {
                  callSessionId,
                  userId,
                });
              }
            }
          }
        } catch (error) {
          console.error("Call end error:", error);
        }
      }
    );

    // Screen Share Signalling — broadcast to all other participants in the call session
    socket.on(
      "call:screen-share-started",
      async ({ callSessionId }: { callSessionId: number }) => {
        try {
          const session = await prisma.callSession.findUnique({
            where: { id: callSessionId },
            include: { participants: true },
          });
          if (!session) return;
          for (const participant of session.participants) {
            if (participant.userId !== userId) {
              io.to(`user_${participant.userId}`).emit("call:screen-share-started", {
                callSessionId,
                fromUserId: userId,
              });
            }
          }
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
          for (const participant of session.participants) {
            if (participant.userId !== userId) {
              io.to(`user_${participant.userId}`).emit("call:screen-share-stopped", {
                callSessionId,
                fromUserId: userId,
              });
            }
          }
        } catch (err) {
          console.error("screen-share-stopped error:", err);
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

    // Disconnect Handler
    socket.on("disconnect", () => {
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
