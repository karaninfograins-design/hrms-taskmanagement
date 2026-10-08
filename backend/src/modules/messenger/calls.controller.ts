import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";

export const getCallHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);

    const calls = await prisma.callSession.findMany({
      where: {
        OR: [
          { hostId: userId },
          { participants: { some: { userId } } },
        ],
      },
      include: {
        host: { select: { id: true, name: true, email: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ calls });
  } catch (error) {
    console.error("Get call history error:", error);
    res.status(500).json({ message: "Failed to fetch call history" });
  }
};

export const initiateCall = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const { targetUserId, type = "VIDEO", conversationId } = req.body;

    if (!targetUserId) {
      res.status(400).json({ message: "Target user ID required" });
      return;
    }

    const channelName = `call-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const call = await prisma.callSession.create({
      data: {
        channelName,
        conversationId: conversationId ? Number(conversationId) : null,
        hostId: userId,
        type: type === "AUDIO" ? "AUDIO" : "VIDEO",
        status: "RINGING",
        participants: {
          create: [
            { userId, status: "ACCEPTED", joinedAt: new Date() },
            { userId: Number(targetUserId), status: "INVITED" },
          ],
        },
      },
      include: {
        host: { select: { id: true, name: true, email: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    res.status(201).json({ call });
  } catch (error) {
    console.error("Initiate call error:", error);
    res.status(500).json({ message: "Failed to initiate call" });
  }
};

export const updateCallStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const callId = Number(req.params.id);
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ message: "Status is required" });
      return;
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "ACTIVE") updateData.startedAt = new Date();
    if (status === "ENDED" || status === "REJECTED" || status === "MISSED") {
      updateData.endedAt = new Date();
    }

    const updated = await prisma.callSession.update({
      where: { id: callId },
      data: updateData,
    });

    res.json({ call: updated });
  } catch (error) {
    console.error("Update call status error:", error);
    res.status(500).json({ message: "Failed to update call status" });
  }
};
