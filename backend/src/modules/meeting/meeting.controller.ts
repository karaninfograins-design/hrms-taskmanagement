import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";
import { createNotificationsForUsers } from "../../controllers/notification.controller.js";
import { getIO } from "../../socket.js";

dotenv.config();

const VALID_MEETING_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export const getMeetings = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    try {
      verifyToken(token);
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    const { projectId, status } = req.query;
    const where: Record<string, unknown> = {};

    if (projectId) {
      const parsedProjectId = Number(projectId);
      if (!isNaN(parsedProjectId)) {
        where.projectId = parsedProjectId;
      }
    }

    if (status && status !== "ALL") {
      let statusStr = String(status).toUpperCase();
      if (statusStr === "ACTIVE") statusStr = "IN_PROGRESS";
      if (statusStr === "ENDED") statusStr = "COMPLETED";
      if ((VALID_MEETING_STATUSES as readonly string[]).includes(statusStr)) {
        where.status = statusStr;
      }
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

    const activeStandupSession = await prisma.callSession.findFirst({
      where: {
        channelName: "permanent-daily-standup",
        status: { in: ["RINGING", "ACTIVE"] },
      },
      include: {
        host: { select: { id: true, name: true, email: true } },
        participants: {
          where: { status: "ACCEPTED" },
          select: { userId: true },
        },
      },
    });

    const standupStatus = activeStandupSession
      ? {
          isLive: true,
          callSessionId: activeStandupSession.id,
          hostId: activeStandupSession.hostId,
          hostName: activeStandupSession.host?.name || "Host",
          participantsCount: activeStandupSession.participants.length,
          startedAt: activeStandupSession.startedAt || activeStandupSession.createdAt,
        }
      : {
          isLive: false,
        };

    res.json({ meetings, standupStatus });
  } catch (error) {
    console.error("Get meetings error:", error);
    res.status(500).json({ message: "Failed to fetch meetings" });
  }
};

export const getMeetingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    let userId: number;
    try {
      const decoded = verifyToken(token);
      userId = decoded.userId;
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }

    const meetingId = Number(req.params.id);
    if (isNaN(meetingId)) {
      res.status(400).json({ message: "Invalid meeting ID" });
      return;
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!meeting) {
      res.status(404).json({ message: "Meeting not found" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    const isAdmin = user?.role?.name === "ADMIN" || user?.role?.name === "SUPER_ADMIN";
    const isHost = meeting.organizerId === userId || isAdmin;

    res.json({
      meeting: {
        ...meeting,
        isHost,
      },
    });
  } catch (error) {
    console.error("Get meeting error:", error);
    res.status(500).json({ message: "Failed to fetch meeting details" });
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

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ message: "Invalid start time or end time format" });
      return;
    }

    if (end <= start) {
      res.status(400).json({ message: "End time must be after start time" });
      return;
    }

    const roomName = `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const cleanParticipantIds = Array.from(
      new Set(
        (Array.isArray(participantIds) ? participantIds : [])
          .map((id) => Number(id))
          .filter((id) => !isNaN(id) && id > 0 && id !== userId)
      )
    );

    const meeting = await prisma.meeting.create({
      data: {
        title: title.trim(),
        description: description ? description.trim() : null,
        agenda: agenda ? agenda.trim() : null,
        roomName,
        organizerId: userId,
        projectId: projectId ? Number(projectId) : null,
        startTime: start,
        endTime: end,
        timezone: timezone ? timezone.trim() : "UTC",
        notes: notes ? notes.trim() : null,
        locationOrLink: process.env.LIVEKIT_URL || null,
        status: "SCHEDULED",
        members: {
          create: [
            { userId, status: "ACCEPTED" },
            ...cleanParticipantIds.map((id: number) => ({ userId: id, status: "INVITED" as const })),
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

    const participantUserIds = meeting.members
      .map((member) => member.userId)
      .filter((participantId) => participantId !== userId);

    void createNotificationsForUsers(
      participantUserIds,
      "MEETING_SCHEDULED",
      "You were invited to a meeting",
      `${meeting.organizer.name} invited you to "${meeting.title}" on ${meeting.startTime.toLocaleString()}.`,
      "/dashboard/meetings/calendar"
    ).catch((error) => console.error("Meeting invitation notification error:", error));

    try {
      const io = getIO();
      io.emit("meeting:created", meeting);
    } catch {
      // Socket may not be initialized in standalone scripts or tests
    }

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

    if (isNaN(meetingId)) {
      res.status(400).json({ message: "Invalid meeting ID" });
      return;
    }

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

    const { title, description, agenda, startTime, endTime, timezone, notes, status, participantIds } = req.body;

    let newStart = existing.startTime;
    let newEnd = existing.endTime;

    if (startTime) {
      newStart = new Date(startTime);
      if (isNaN(newStart.getTime())) {
        res.status(400).json({ message: "Invalid start time format" });
        return;
      }
    }

    if (endTime) {
      newEnd = new Date(endTime);
      if (isNaN(newEnd.getTime())) {
        res.status(400).json({ message: "Invalid end time format" });
        return;
      }
    }

    if (newEnd <= newStart) {
      res.status(400).json({ message: "End time must be after start time" });
      return;
    }

    let normalizedStatus: string | undefined = undefined;
    if (status) {
      let s = String(status).toUpperCase();
      if (s === "ACTIVE") s = "IN_PROGRESS";
      if (s === "ENDED") s = "COMPLETED";
      if (!(VALID_MEETING_STATUSES as readonly string[]).includes(s)) {
        res.status(400).json({
          message: `Invalid status. Valid options are: ${VALID_MEETING_STATUSES.join(", ")}, ACTIVE, ENDED`,
        });
        return;
      }
      normalizedStatus = s;
    }

    if (Array.isArray(participantIds)) {
      const cleanParticipantIds = Array.from(
        new Set(
          participantIds
            .map((id: any) => Number(id))
            .filter((id: number) => !isNaN(id) && id > 0 && id !== existing.organizerId)
        )
      );
      await prisma.meetingParticipant.deleteMany({
        where: {
          meetingId,
          userId: { notIn: [existing.organizerId, ...cleanParticipantIds] },
        },
      });
      for (const pId of cleanParticipantIds) {
        await prisma.meetingParticipant.upsert({
          where: { meetingId_userId: { meetingId, userId: pId } },
          update: {},
          create: { meetingId, userId: pId, status: "INVITED" },
        });
      }
    }

    const updated = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
        ...(agenda !== undefined && { agenda: agenda ? agenda.trim() : null }),
        ...(startTime && { startTime: newStart }),
        ...(endTime && { endTime: newEnd }),
        ...(timezone && { timezone: timezone.trim() }),
        ...(notes !== undefined && { notes: notes ? notes.trim() : null }),
        ...(normalizedStatus && { status: normalizedStatus as any }),
      },
      include: {
        organizer: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    const recipientIds = Array.from(
      new Set([existing.organizerId, ...updated.members.map((member) => member.userId)])
    ).filter((recipientId) => recipientId !== userId);

    const meetingStatusMessage =
      updated.status === "CANCELLED"
        ? `"${updated.title}" was cancelled by ${user?.name || "the organizer"}.`
        : `"${updated.title}" was updated by ${user?.name || "the organizer"}; it is scheduled for ${updated.startTime.toLocaleString()}.`;

    void createNotificationsForUsers(
      recipientIds,
      "MEETING_UPDATED",
      updated.status === "CANCELLED" ? "Meeting cancelled" : "Meeting updated",
      meetingStatusMessage,
      "/dashboard/meetings/calendar"
    ).catch((error) => console.error("Meeting update notification error:", error));

    try {
      const io = getIO();
      io.emit("meeting:updated", {
        meetingId: updated.id,
        status: updated.status,
        meeting: updated,
      });
    } catch {
      // Socket may not be initialized in standalone scripts or tests
    }

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

    if (isNaN(meetingId)) {
      res.status(400).json({ message: "Invalid meeting ID" });
      return;
    }

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

    try {
      const io = getIO();
      io.emit("meeting:deleted", { meetingId });
    } catch {
      // Socket may not be initialized in standalone scripts or tests
    }

    res.json({ message: "Meeting deleted successfully" });
  } catch (error) {
    console.error("Delete meeting error:", error);
    res.status(500).json({ message: "Failed to delete meeting" });
  }
};

export const getLiveKitToken = async (req: Request, res: Response): Promise<void> => {
  try {
    dotenv.config();
    const livekitUrl =
      process.env.LIVEKIT_URL || (process.env.NODE_ENV !== "production" ? "ws://localhost:7880" : undefined);
    const livekitApiKey =
      process.env.LIVEKIT_API_KEY || (process.env.NODE_ENV !== "production" ? "devkey" : undefined);
    const livekitApiSecret =
      process.env.LIVEKIT_API_SECRET || (process.env.NODE_ENV !== "production" ? "secret" : undefined);

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      res.status(503).json({ message: "LiveKit is not configured on the server" });
      return;
    }

    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const meetingId = Number(req.params.id);

    if (isNaN(meetingId)) {
      res.status(400).json({ message: "Invalid meeting ID" });
      return;
    }

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

    if (meeting.status === "CANCELLED") {
      res.status(400).json({ message: "Cannot join a cancelled meeting" });
      return;
    }

    const isPermanent =
      meeting.roomName === "permanent-daily-standup" ||
      meeting.roomName.startsWith("permanent-") ||
      meeting.title.toLowerCase().includes("daily standup");

    if (meeting.status === "COMPLETED") {
      if (isPermanent) {
        // Automatically reopen permanent 24/7 company room so it is always accessible
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { status: "IN_PROGRESS" },
        });
      } else {
        res.status(400).json({ message: "This meeting has already ended and is marked as completed" });
        return;
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Automatically transition SCHEDULED meetings to IN_PROGRESS when participants join
    if (meeting.status === "SCHEDULED") {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "IN_PROGRESS" },
      });
      try {
        const io = getIO();
        io.emit("meeting:updated", {
          meetingId,
          status: "IN_PROGRESS",
        });
      } catch {
        // Socket may not be initialized
      }
    }

    // Mark user as ATTENDED if they are an invited participant, or record them
    const existingMember = meeting.members.find((m) => m.userId === userId);
    if (existingMember && existingMember.status !== "ATTENDED") {
      await prisma.meetingParticipant.update({
        where: { meetingId_userId: { meetingId, userId } },
        data: { status: "ATTENDED" },
      }).catch(() => null);
    } else if (!existingMember) {
      await prisma.meetingParticipant.create({
        data: { meetingId, userId, status: "ATTENDED" },
      }).catch(() => null);
    }

    const now = Math.floor(Date.now() / 1000);
    const livekitJwtPayload = {
      iss: livekitApiKey,
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

    const livekitToken = jwt.sign(livekitJwtPayload, livekitApiSecret);

    res.json({
      token: livekitToken,
      url: livekitUrl,
      roomName: meeting.roomName,
    });
  } catch (error) {
    console.error("Get LiveKit token error:", error);
    res.status(500).json({ message: "Failed to generate LiveKit room token" });
  }
};
