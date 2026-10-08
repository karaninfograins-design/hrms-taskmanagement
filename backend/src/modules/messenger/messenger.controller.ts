import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";
import { getIO } from "../../socket.js";

export const getConversations = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    const isSuperAdmin = currentUser?.role?.name?.toUpperCase().includes("ADMIN");

    const conversations = await prisma.conversation.findMany({
      where: isSuperAdmin
        ? {
            OR: [
              { participants: { some: { userId } } },
              { type: "GROUP" },
            ],
          }
        : {
            participants: {
              some: { userId },
            },
          },
      include: {
        createdBy: { select: { id: true, name: true } },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: { select: { name: true } },
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            sender: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = conversations.map((conv: any) => {
      const myMembership = conv.participants.find((p: any) => p.userId === userId);
      const lastReadAt = myMembership?.lastReadAt;

      const unreadCount = conv.messages.filter(
        (m: any) => (!lastReadAt || m.createdAt > lastReadAt) && m.senderId !== userId
      ).length;

      return {
        ...conv,
        lastMessage: conv.messages[0] || null,
        unreadCount,
      };
    });

    res.json({ conversations: result });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
};

export const createDirectConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const { targetUserId } = req.body;

    if (!targetUserId || Number(targetUserId) === userId) {
      res.status(400).json({ message: "Valid target user required" });
      return;
    }

    const targetId = Number(targetUserId);

    const existing = await prisma.conversation.findFirst({
      where: {
        type: "DIRECT",
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: targetId } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (existing) {
      res.json({ conversation: existing });
      return;
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: "DIRECT",
        createdById: userId,
        participants: {
          create: [{ userId }, { userId: targetId }],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    res.status(201).json({ conversation });
  } catch (error) {
    console.error("Create direct conversation error:", error);
    res.status(500).json({ message: "Failed to create conversation" });
  }
};

export const createGroupConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const { name, participantIds = [] } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ message: "Group name is required" });
      return;
    }

    const uniqueMemberIds = Array.from(
      new Set([userId, ...participantIds.map(Number)])
    );

    const conversation = await prisma.conversation.create({
      data: {
        type: "GROUP",
        name: name.trim(),
        createdById: userId,
        participants: {
          create: uniqueMemberIds.map((id: number) => ({
            userId: id,
            role: id === userId ? "ADMIN" : "MEMBER",
          })),
        },
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    res.status(201).json({ conversation });
  } catch (error) {
    console.error("Create group conversation error:", error);
    res.status(500).json({ message: "Failed to create group conversation" });
  }
};

export const getMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const conversationId = Number(req.params.conversationId);

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      res.status(403).json({ message: "Access denied to conversation messages" });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { lastReadAt: new Date() },
    });

    res.json({ messages });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const { conversationId, content, attachmentUrl, attachmentType, replyToId } = req.body;

    if (!conversationId || ((!content || !content.trim()) && !attachmentUrl)) {
      res.status(400).json({ message: "Conversation ID and content or attachment required" });
      return;
    }

    const convId = Number(conversationId);

    let participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: convId, userId },
      },
    });

    if (!participant) {
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: { select: { name: true } } },
      });
      const isSuperAdmin = currentUser?.role?.name?.toUpperCase().includes("ADMIN");
      const conversation = await prisma.conversation.findUnique({ where: { id: convId } });

      if (isSuperAdmin && conversation?.type === "GROUP") {
        participant = await prisma.conversationParticipant.create({
          data: { conversationId: convId, userId },
        });
      } else {
        res.status(403).json({ message: "Not a member of this conversation" });
        return;
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId: convId,
        senderId: userId,
        content: content ? content.trim() : "",
        attachmentUrl: attachmentUrl || null,
        attachmentType: attachmentType || null,
        replyToId: replyToId ? Number(replyToId) : null,
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
    });

    await prisma.conversation.update({
      where: { id: convId },
      data: { updatedAt: new Date() },
    });

    // Real-Time Socket.IO Broadcast
    try {
      const io = getIO();
      io.to(`conversation_${convId}`).emit("message:new", message);

      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId: convId },
        select: { userId: true },
      });
      participants.forEach((p) => {
        io.to(`user_${p.userId}`).emit("conversation:updated", {
          conversationId: convId,
          lastMessage: message,
        });
      });
    } catch (err) {
      console.error("Socket emit error in sendMessage:", err);
    }

    res.status(201).json({ message });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

export const editMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const messageId = Number(req.params.id);
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ message: "Content cannot be empty" });
      return;
    }

    const existing = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!existing) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    if (existing.senderId !== userId) {
      res.status(403).json({ message: "Only sender can edit their message" });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: content.trim(),
        editedAt: new Date(),
      },
      include: {
        sender: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ message: updated });
  } catch (error) {
    console.error("Edit message error:", error);
    res.status(500).json({ message: "Failed to edit message" });
  }
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const messageId = Number(req.params.id);

    const existing = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!existing) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    const roleName = user?.role?.name || "";
    const isAdmin = roleName === "ADMIN" || roleName === "SUPER_ADMIN";

    if (existing.senderId !== userId && !isAdmin) {
      res.status(403).json({ message: "Permission denied to delete message" });
      return;
    }

    const deleted = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: "This message was deleted",
        deletedAt: new Date(),
      },
    });

    res.json({ message: deleted });
  } catch (error) {
    console.error("Delete message error:", error);
    res.status(500).json({ message: "Failed to delete message" });
  }
};

export const searchMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const query = String(req.query.q || "").trim();

    if (!query) {
      res.json({ messages: [] });
      return;
    }

    const messages = await prisma.message.findMany({
      where: {
        content: { contains: query },
        deletedAt: null,
        conversation: {
          participants: {
            some: { userId },
          },
        },
      },
      include: {
        sender: { select: { id: true, name: true } },
        conversation: { select: { id: true, name: true, type: true } },
      },
      take: 30,
      orderBy: { createdAt: "desc" },
    });

    res.json({ messages });
  } catch (error) {
    console.error("Search messages error:", error);
    res.status(500).json({ message: "Failed to search messages" });
  }
};

export const uploadAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileData, fileName, fileType } = req.body;
    if (!fileData) {
      res.status(400).json({ message: "File data is required" });
      return;
    }

    const matches = fileData.match(/^data:(.+);base64,(.+)$/);
    const base64Data = matches ? matches[2] : fileData;
    const buffer = Buffer.from(base64Data, "base64");

    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const cleanName = (fileName || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueFileName = `${Date.now()}_${cleanName}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

    fs.writeFileSync(filePath, buffer);

    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:5000";
    const fileUrl = `${protocol}://${host}/uploads/${uniqueFileName}`;

    res.json({
      url: fileUrl,
      fileName: cleanName,
      type: fileType || (cleanName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? "IMAGE" : "DOCUMENT"),
    });
  } catch (err: any) {
    console.error("Error uploading attachment:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
};

export const updateGroupConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const { id } = req.params;
    const { name, participantIds } = req.body;

    const convId = Number(id);
    const conversation = await prisma.conversation.findUnique({
      where: { id: convId },
      include: { participants: true },
    });

    if (!conversation || conversation.type !== "GROUP") {
      res.status(404).json({ message: "Group conversation not found" });
      return;
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    const isSuperAdmin = currentUser?.role?.name?.toUpperCase().includes("ADMIN");
    const isMember = conversation.participants.some((p) => p.userId === userId);

    if (!isMember && !isSuperAdmin) {
      res.status(403).json({ message: "Not authorized to modify this group" });
      return;
    }

    if (name && name.trim()) {
      await prisma.conversation.update({
        where: { id: convId },
        data: { name: name.trim() },
      });
    }

    if (Array.isArray(participantIds)) {
      const targetUserIds = Array.from(new Set([userId, ...participantIds.map(Number)]));
      const existingUserIds = conversation.participants.map((p) => p.userId);

      const idsToAdd = targetUserIds.filter((uid) => !existingUserIds.includes(uid));
      if (idsToAdd.length > 0) {
        await prisma.conversationParticipant.createMany({
          data: idsToAdd.map((uid) => ({
            conversationId: convId,
            userId: uid,
          })),
        });
      }

      const idsToRemove = existingUserIds.filter((uid) => !targetUserIds.includes(uid));
      if (idsToRemove.length > 0) {
        await prisma.conversationParticipant.deleteMany({
          where: {
            conversationId: convId,
            userId: { in: idsToRemove },
          },
        });
      }
    }

    const updatedGroup = await prisma.conversation.findUnique({
      where: { id: convId },
      include: {
        createdBy: { select: { id: true, name: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    res.json({ conversation: updatedGroup });
  } catch (error) {
    console.error("Update group error:", error);
    res.status(500).json({ message: "Failed to update group" });
  }
};


