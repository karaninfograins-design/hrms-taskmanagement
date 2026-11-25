import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";
import { getIO } from "../../socket.js";
import { loadReactionsStore, toggleMessageReaction } from "./reactions.js";

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
                designation: { select: { name: true } },
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

    // Bitrix-Style initial group creation system message
    const creatorName = conversation.createdBy?.name || "A member";
    const initialMsg = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        content: `${creatorName} created the group "${name.trim()}".`,
        attachmentType: "SYSTEM",
      },
      include: {
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    }).catch(() => null);

    if (initialMsg) {
      const io = getIO();
      for (const uid of uniqueMemberIds) {
        io.to(`user_${uid}`).emit("message:new", initialMsg);
      }
    }

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

    const limitParam = req.query.limit || req.query.take;
    const limit = limitParam ? Math.min(Math.max(Number(limitParam), 1), 100) : 50;
    const cursorId = req.query.cursor ? Number(req.query.cursor) : undefined;
    const beforeId = req.query.before ? Number(req.query.before) : undefined;
    const fetchAll = req.query.all === "true";

    let messages: any[];
    let hasMore = false;
    let nextCursor: number | null = null;

    if (fetchAll) {
      messages = await prisma.message.findMany({
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
    } else {
      const whereClause: any = { conversationId };
      if (beforeId && !isNaN(beforeId)) {
        whereClause.id = { lt: beforeId };
      }

      const cursorOption = cursorId && !isNaN(cursorId)
        ? { cursor: { id: cursorId }, skip: 1 }
        : undefined;

      const messagesDesc = await prisma.message.findMany({
        where: whereClause,
        take: limit,
        ...cursorOption,
        orderBy: { id: "desc" },
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

      hasMore = messagesDesc.length === limit;
      const oldestMessage = messagesDesc[messagesDesc.length - 1];
      nextCursor = hasMore && oldestMessage ? oldestMessage.id : null;

      // Reverse to chronological order (asc) for seamless chat display
      messages = [...messagesDesc].reverse();
    }

    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { lastReadAt: new Date() },
    });

    // Fetch conversation participants with designations and read status for Bitrix-style seen receipts
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            designation: { select: { name: true } },
          },
        },
      },
    });

    const participantsList = participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      email: p.user.email,
      designation: p.user.designation?.name || null,
      lastReadAt: p.lastReadAt,
    }));

    const reactionsStore = loadReactionsStore();
    const messagesWithSeen = messages.map((m: any) => {
      const msgTime = new Date(m.createdAt).getTime();
      const seenBy = participantsList
        .filter((p) => p.userId !== m.senderId && p.lastReadAt && new Date(p.lastReadAt).getTime() >= msgTime)
        .map((p) => ({
          userId: p.userId,
          name: p.name,
          designation: p.designation,
          readAt: p.lastReadAt,
        }));

      return {
        ...m,
        reactions: reactionsStore[String(m.id)] || {},
        seenBy,
      };
    });

    // Notify room of live read status update
    try {
      const io = getIO();
      const currentReader = participantsList.find((p) => p.userId === userId);
      io.to(`conversation_${conversationId}`).emit("conversation:seen", {
        conversationId,
        userId,
        name: currentReader?.name || `User ${userId}`,
        designation: currentReader?.designation || null,
        readAt: new Date().toISOString(),
      });
      io.to(`user_${userId}`).emit("conversation:marked-read", {
        conversationId,
      });
    } catch { }

    const conversationInfo = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        type: true,
        name: true,
        createdAt: true,
        createdById: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({
      conversation: conversationInfo,
      messages: messagesWithSeen,
      participants: participantsList,
      pagination: {
        limit: fetchAll ? messages.length : limit,
        hasMore,
        nextCursor,
        count: messages.length,
      },
    });
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

    const messageWithMeta = {
      ...message,
      reactions: {},
      seenBy: [],
    };

    // Real-Time Socket.IO Broadcast
    try {
      const io = getIO();
      io.to(`conversation_${convId}`).emit("message:new", messageWithMeta);

      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId: convId },
        select: { userId: true },
      });
      participants.forEach((p) => {
        io.to(`user_${p.userId}`).emit("conversation:updated", {
          conversationId: convId,
          lastMessage: messageWithMeta,
        });
      });
    } catch (err) {
      console.error("Socket emit error in sendMessage:", err);
    }

    res.status(201).json({ message: messageWithMeta });
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

export const reactToMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const messageId = Number(req.params.id);
    const { emoji } = req.body;

    if (!emoji || typeof emoji !== "string" || emoji.trim().length === 0 || emoji.length > 32) {
      res.status(400).json({ message: "Invalid or unsupported reaction emoji" });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });

    if (!message) {
      res.status(404).json({ message: "Message not found" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });

    const updatedReactions = toggleMessageReaction(
      messageId,
      userId,
      user?.name || `User ${userId}`,
      emoji
    );

    // Real-Time Socket.IO Broadcast to conversation room
    try {
      const io = getIO();
      io.to(`conversation_${message.conversationId}`).emit("message:reaction", {
        messageId,
        conversationId: message.conversationId,
        reactions: updatedReactions,
      });
    } catch (err) {
      console.error("Socket emit error for reaction:", err);
    }

    res.json({ messageId, reactions: updatedReactions });
  } catch (error) {
    console.error("React to message error:", error);
    res.status(500).json({ message: "Failed to update reaction" });
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

    const publicApiUrl = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, "");
    const requestHost = req.get("host");
    const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const baseUrl = publicApiUrl || (requestHost ? `${forwardedProto}://${requestHost}` : null);
    if (!baseUrl) {
      res.status(500).json({ message: "Public API URL is not configured" });
      return;
    }
    const fileUrl = `${baseUrl}/uploads/${uniqueFileName}`;

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

    const actorUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    const actorName = actorUser?.name || "A member";

    let nameChanged = false;
    if (name && name.trim() && name.trim() !== conversation.name) {
      nameChanged = true;
      await prisma.conversation.update({
        where: { id: convId },
        data: { name: name.trim() },
      });
    }

    let addedUserIds: number[] = [];
    let removedUserIds: number[] = [];

    if (Array.isArray(participantIds)) {
      const targetUserIds = Array.from(new Set([userId, ...participantIds.map(Number)]));
      const existingUserIds = conversation.participants.map((p) => p.userId);

      const idsToAdd = targetUserIds.filter((uid) => !existingUserIds.includes(uid));
      if (idsToAdd.length > 0) {
        addedUserIds = idsToAdd;
        await prisma.conversationParticipant.createMany({
          data: idsToAdd.map((uid) => ({
            conversationId: convId,
            userId: uid,
          })),
        });
      }

      const idsToRemove = existingUserIds.filter((uid) => !targetUserIds.includes(uid));
      if (idsToRemove.length > 0) {
        removedUserIds = idsToRemove;
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

    if (updatedGroup) {
      const io = getIO();
      const updatedUserIds = updatedGroup.participants.map((participant) => participant.userId);

      // Bitrix-Style Activity System Messages:
      // 1. Group renamed
      if (nameChanged && name?.trim()) {
        const nameMsg = await prisma.message.create({
          data: {
            conversationId: convId,
            senderId: userId,
            content: `${actorName} changed the group name to "${name.trim()}".`,
            attachmentType: "SYSTEM",
          },
          include: {
            sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        }).catch(() => null);
        if (nameMsg) {
          for (const pid of updatedUserIds) {
            io.to(`user_${pid}`).emit("message:new", nameMsg);
          }
        }
      }

      // 2. Members added
      if (addedUserIds.length > 0) {
        const addedUsers = await prisma.user.findMany({
          where: { id: { in: addedUserIds } },
          select: { id: true, name: true },
        });
        const firstAdded = addedUsers[0]?.name || "a member";
        const secondAdded = addedUsers[1]?.name || "another member";
        const addedNames = addedUsers.length === 1
          ? firstAdded
          : addedUsers.length === 2
            ? `${firstAdded} and ${secondAdded}`
            : `${firstAdded} and ${addedUsers.length - 1} others`;
        const addMsg = await prisma.message.create({
          data: {
            conversationId: convId,
            senderId: userId,
            content: `${actorName} added ${addedNames} to the chat.`,
            attachmentType: "SYSTEM",
          },
          include: {
            sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        }).catch(() => null);
        if (addMsg) {
          for (const pid of updatedUserIds) {
            io.to(`user_${pid}`).emit("message:new", addMsg);
          }
        }
      }

      // 3. Members removed
      if (removedUserIds.length > 0) {
        const removedUsers = await prisma.user.findMany({
          where: { id: { in: removedUserIds } },
          select: { id: true, name: true },
        });
        const firstRemoved = removedUsers[0]?.name || "a member";
        const removedNames = removedUsers.length === 1
          ? firstRemoved
          : `${firstRemoved} and ${removedUsers.length - 1} others`;
        const removeMsg = await prisma.message.create({
          data: {
            conversationId: convId,
            senderId: userId,
            content: `${actorName} removed ${removedNames} from the chat.`,
            attachmentType: "SYSTEM",
          },
          include: {
            sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        }).catch(() => null);
        if (removeMsg) {
          for (const pid of updatedUserIds) {
            io.to(`user_${pid}`).emit("message:new", removeMsg);
          }
        }
      }

      for (const participantId of updatedUserIds) {
        io.to(`user_${participantId}`).emit("conversation:members-updated", {
          conversation: updatedGroup,
        });
      }

      for (const participantId of removedUserIds) {
        io.in(`user_${participantId}`).socketsLeave(`conversation_${convId}`);
        io.to(`user_${participantId}`).emit("conversation:members-updated", {
          conversationId: convId,
          removed: true,
        });
      }
    }

    res.json({ conversation: updatedGroup });
  } catch (error) {
    console.error("Update group error:", error);
    res.status(500).json({ message: "Failed to update group" });
  }
};

export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const convId = Number(req.params.id);

    const conversation = await prisma.conversation.findUnique({
      where: { id: convId },
      include: {
        participants: true,
      },
    });

    if (!conversation) {
      res.status(404).json({ message: "Conversation not found" });
      return;
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } } },
    });
    const isSuperAdmin = currentUser?.role?.name?.toUpperCase().includes("ADMIN");
    const isCreator = Number(conversation.createdById) === Number(userId);
    const isParticipant = conversation.participants.some((p) => Number(p.userId) === Number(userId));

    // Group deletion security: Only the group creator (or Super Admin) can delete a group channel
    if (conversation.type === "GROUP") {
      if (!isCreator && !isSuperAdmin) {
        res.status(403).json({ message: "Only the group creator can delete this group channel" });
        return;
      }
    } else {
      if (!isParticipant && !isSuperAdmin) {
        res.status(403).json({ message: "Not authorized to delete this conversation" });
        return;
      }
    }

    // 1. Delete associated messages
    await prisma.message.deleteMany({
      where: { conversationId: convId },
    });

    // 2. Delete participants
    await prisma.conversationParticipant.deleteMany({
      where: { conversationId: convId },
    });

    // 3. Set call sessions conversationId to null if any
    await prisma.callSession.updateMany({
      where: { conversationId: convId },
      data: { conversationId: null },
    });

    // 4. Delete the conversation
    await prisma.conversation.delete({
      where: { id: convId },
    });

    // Real-Time Socket.IO Broadcast to participants
    try {
      const io = getIO();
      conversation.participants.forEach((p) => {
        io.to(`user_${p.userId}`).emit("conversation:deleted", { conversationId: convId });
      });
      io.to(`conversation_${convId}`).emit("conversation:deleted", { conversationId: convId });
    } catch (err) {
      console.error("Socket emit error on conversation delete:", err);
    }

    res.json({ message: "Conversation deleted successfully", id: convId });
  } catch (error) {
    console.error("Delete conversation error:", error);
    res.status(500).json({ message: "Failed to delete conversation" });
  }
};

export const leaveGroupConversation = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const { id } = req.params;
    const convId = Number(id);

    const conversation = await prisma.conversation.findUnique({
      where: { id: convId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!conversation || conversation.type !== "GROUP") {
      res.status(404).json({ message: "Group conversation not found" });
      return;
    }

    const participant = conversation.participants.find((p) => p.userId === userId);
    if (!participant) {
      res.status(400).json({ message: "You are not a member of this group" });
      return;
    }

    // 1. Remove user from conversationParticipant
    await prisma.conversationParticipant.deleteMany({
      where: {
        conversationId: convId,
        userId,
      },
    });

    const leavingUserName = participant.user?.name || "A member";
    const io = getIO();

    // 2. Create Bitrix-style activity message
    const leaveMsg = await prisma.message.create({
      data: {
        conversationId: convId,
        senderId: userId,
        content: `${leavingUserName} left the chat.`,
        attachmentType: "SYSTEM",
      },
      include: {
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    }).catch(() => null);

    // 3. Socket notifications
    const remainingParticipants = conversation.participants.filter((p) => p.userId !== userId);

    if (leaveMsg) {
      for (const p of remainingParticipants) {
        io.to(`user_${p.userId}`).emit("message:new", leaveMsg);
      }
    }

    io.in(`user_${userId}`).socketsLeave(`conversation_${convId}`);
    io.to(`user_${userId}`).emit("conversation:members-updated", {
      conversationId: convId,
      removed: true,
    });

    for (const p of remainingParticipants) {
      io.to(`user_${p.userId}`).emit("conversation:members-updated", {
        conversationId: convId,
        participantId: userId,
        action: "left",
      });
    }

    res.json({ message: "You have left the group successfully", conversationId: convId });
  } catch (error) {
    console.error("Leave group error:", error);
    res.status(500).json({ message: "Failed to leave group" });
  }
};
