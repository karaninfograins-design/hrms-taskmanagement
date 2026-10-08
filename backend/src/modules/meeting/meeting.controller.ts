import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "devkey";
const LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET || "secretsecretsecretsecretsecretsecretsecretsecret";

export const getMeetings = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    verifyToken(token);
    const { projectId, status } = req.query;

    const where: Record<string, unknown> = {};

    if (projectId) {
      where.projectId = Number(projectId);
    }

    if (status && status !== "ALL") {
      where.status = String(status);
    }

    const meetings = await prisma.meeting.findMany({
      where,
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    res.json({ meetings });
  } catch (error) {
    console.error("Get meetings error:", error);
    res.status(500).json({ message: "Failed to fetch meetings" });
  }
};

export const createMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const {
      title,
      description,
      agenda,
      startTime,
      endTime,
      timezone = "UTC",
      notes,
      projectId,
      participantIds = [],
    } = req.body;

    if (!title || !startTime || !endTime) {
      res.status(400).json({ message: "Title, start time, and end time are required" });
      return;
    }

    const roomName = `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const meeting = await prisma.meeting.create({
      data: {
        title: title.trim(),
        description: description ? description.trim() : null,
        agenda: agenda ? agenda.trim() : null,
        roomName,
        organizerId: userId,
        projectId: projectId ? Number(projectId) : null,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        timezone: timezone ? timezone.trim() : "UTC",
        notes: notes ? notes.trim() : null,
        locationOrLink: `ws://localhost:7880`,
        status: "SCHEDULED",
        members: {
          create: [
            { userId, status: "ACCEPTED" },
            ...participantIds
              .filter((id: number) => id !== userId)
              .map((id: number) => ({ userId: Number(id), status: "INVITED" })),
          ],
        },
      },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    res.status(201).json({ message: "Meeting scheduled successfully", meeting });
  } catch (error) {
    console.error("Create meeting error:", error);
    res.status(500).json({ message: "Failed to schedule meeting" });
  }
};

export const updateMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const meetingId = Number(req.params.id);

    const existing = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!existing) {
      res.status(404).json({ message: "Meeting not found" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    const roleName = user?.role?.name || "";
    const isAdmin = roleName === "ADMIN" || roleName === "SUPER_ADMIN";

    if (existing.organizerId !== userId && !isAdmin) {
      res.status(403).json({ message: "Only the organizer or admin can edit this meeting" });
      return;
    }

    const { title, description, agenda, startTime, endTime, timezone, notes, status } = req.body;

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
        ...(agenda !== undefined && { agenda: agenda ? agenda.trim() : null }),
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime && { endTime: new Date(endTime) }),
        ...(timezone && { timezone: timezone.trim() }),
        ...(notes !== undefined && { notes: notes ? notes.trim() : null }),
        ...(status && { status }),
      },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    res.json({ message: "Meeting updated successfully", meeting: updated });
  } catch (error) {
    console.error("Update meeting error:", error);
    res.status(500).json({ message: "Failed to update meeting" });
  }
};

export const deleteMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const meetingId = Number(req.params.id);

    const existing = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!existing) {
      res.status(404).json({ message: "Meeting not found" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    const roleName = user?.role?.name || "";
    const isAdmin = roleName === "ADMIN" || roleName === "SUPER_ADMIN";

    if (existing.organizerId !== userId && !isAdmin) {
      res.status(403).json({ message: "Only organizer or admin can delete this meeting" });
      return;
    }

    await prisma.meeting.delete({
      where: { id: meetingId },
    });

    res.json({ message: "Meeting deleted successfully" });
  } catch (error) {
    console.error("Delete meeting error:", error);
    res.status(500).json({ message: "Failed to delete meeting" });
  }
};

export const getLiveKitToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const meetingId = Number(req.params.id);

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        members: true,
      },
    });

    if (!meeting) {
      res.status(404).json({ message: "Meeting not found" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const livekitJwtPayload = {
      iss: LIVEKIT_API_KEY,
      sub: String(user.id),
      name: user.name,
      nbf: now - 5,
      exp: now + 3600 * 4,
      video: {
        room: meeting.roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    };

    const livekitToken = jwt.sign(livekitJwtPayload, LIVEKIT_API_SECRET);

    res.json({
      token: livekitToken,
      url: process.env.LIVEKIT_URL || "ws://localhost:7880",
      roomName: meeting.roomName,
    });
  } catch (error) {
    console.error("Get LiveKit token error:", error);
    res.status(500).json({ message: "Failed to generate LiveKit room token" });
  }
};
