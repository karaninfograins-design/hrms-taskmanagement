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
        targetUserId: number;
        conversationId?: number;
        type: "AUDIO" | "VIDEO";
        channelName: string;
      }) => {
        const caller = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true },
        });

        // Create call session record
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
                { userId: data.targetUserId, status: "INVITED" },
              ],
            },
          },
        });

        io.to(`user_${data.targetUserId}`).emit("incoming:call", {
          callSessionId: session.id,
          channelName: data.channelName,
          caller,
          type: data.type,
          conversationId: data.conversationId,
        });
      }
    );

    socket.on("call:accept", async ({ callSessionId }: { callSessionId: number }) => {
      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });

      await prisma.callParticipant.update({
        where: {
          callSessionId_userId: { callSessionId, userId },
        },
        data: { status: "ACCEPTED", joinedAt: new Date() },
      });

      const session = await prisma.callSession.findUnique({
        where: { id: callSessionId },
      });

      if (session) {
        io.to(`user_${session.hostId}`).emit("call:accepted", { callSessionId, userId });
      }
    });

    socket.on("call:reject", async ({ callSessionId }: { callSessionId: number }) => {
      await prisma.callSession.update({
        where: { id: callSessionId },
        data: { status: "REJECTED", endedAt: new Date() },
      });

      const session = await prisma.callSession.findUnique({
        where: { id: callSessionId },
      });

      if (session) {
        io.to(`user_${session.hostId}`).emit("call:rejected", { callSessionId, userId });
      }
    });

    socket.on(
      "call:end",
      async ({ callSessionId, duration }: { callSessionId: number; duration?: number }) => {
        await prisma.callSession.update({
          where: { id: callSessionId },
          data: { status: "ENDED", endedAt: new Date() },
        });

        io.emit("call:ended", { callSessionId, endedBy: userId });
      }
    );

    // WebRTC Peer Connection SDP Offer/Answer & ICE Candidates
    socket.on(
      "webrtc:offer",
      ({ targetUserId, offer }: { targetUserId: number; offer: unknown }) => {
        io.to(`user_${targetUserId}`).emit("webrtc:offer", {
          fromUserId: userId,
          offer,
        });
      }
    );

    socket.on(
      "webrtc:answer",
      ({ targetUserId, answer }: { targetUserId: number; answer: unknown }) => {
        io.to(`user_${targetUserId}`).emit("webrtc:answer", {
          fromUserId: userId,
          answer,
        });
      }
    );

    socket.on(
      "webrtc:ice-candidate",
      ({ targetUserId, candidate }: { targetUserId: number; candidate: unknown }) => {
        io.to(`user_${targetUserId}`).emit("webrtc:ice-candidate", {
          fromUserId: userId,
          candidate,
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
