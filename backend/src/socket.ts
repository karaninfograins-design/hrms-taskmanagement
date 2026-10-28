import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyToken } from "./utils/jwt.js";
import { prisma } from "./config/prisma.js";

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
          status: { in: ["ACCEPTED", "INVITED"] },
        },
        select: { userId: true },
      },
    },
  });
  if (!session || (session.status !== "ACTIVE" && session.status !== "RINGING")) return false;
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
  });
  ioInstance = io;

  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const decoded = verifyToken(token);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", async (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    if (!userId) return;

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

          let targetUserIds: number[];
          let conversationName: string | null = null;
          const isGroupCall = Boolean(data.targetUserIds);

          if (isGroupCall) {
            const conversation = data.conversationId
              ? await prisma.conversation.findUnique({
                  where: { id: data.conversationId },
                  select: {
                    type: true,
                    name: true,
                    participants: { select: { userId: true } },
                  },
                })
              : null;
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
          } else if (data.targetUserId && data.targetUserId !== userId) {
            targetUserIds = [data.targetUserId];
          } else {
            acknowledge?.({ error: "Call recipient is required" });
            return;
          }

          const session = await prisma.callSession.create({
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
          include: { participants: { select: { userId: true, status: true } } },
        });
        if (
          !session ||
          !session.participants.some(
            (participant) => participant.userId === userId && participant.status === "ACCEPTED"
          )
        ) return;

        const participantIds = session.participants
          .filter((participant) => participant.status === "ACCEPTED")
          .map((participant) => participant.userId);
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

        if (session.participants.length <= 2) {
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
