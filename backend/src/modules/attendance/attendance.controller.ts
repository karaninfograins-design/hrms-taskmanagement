import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";

export const getTodayAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findFirst({
      where: {
        userId,
        date: today,
      },
    });

    res.json({ attendance });
  } catch (error) {
    console.error("Get today attendance error:", error);
    res.status(500).json({ message: "Failed to fetch today attendance" });
  }
};

export const checkIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    let attendance = await prisma.attendance.findFirst({
      where: { userId, date: today },
    });

    if (attendance && attendance.checkIn) {
      res.status(400).json({ message: "You have already checked in today" });
      return;
    }

    if (attendance) {
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkIn: now,
          status: now.getHours() >= 10 ? "LATE" : "PRESENT",
        },
      });
    } else {
      attendance = await prisma.attendance.create({
        data: {
          userId,
          date: today,
          checkIn: now,
          status: now.getHours() >= 10 ? "LATE" : "PRESENT",
        },
      });
    }

    res.json({ message: "Checked in successfully", attendance });
  } catch (error) {
    console.error("Check in error:", error);
    res.status(500).json({ message: "Failed to check in" });
  }
};

export const checkOut = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();

    const attendance = await prisma.attendance.findFirst({
      where: { userId, date: today },
    });

    if (!attendance || !attendance.checkIn) {
      res.status(400).json({ message: "You must check in before checking out" });
      return;
    }

    const durationMs = now.getTime() - new Date(attendance.checkIn).getTime();
    const workingHours = Number((durationMs / (1000 * 60 * 60)).toFixed(2));

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: now,
        workingHours,
        status: workingHours < 4 ? "HALF_DAY" : attendance.status,
      },
    });

    res.json({ message: "Checked out successfully", attendance: updated });
  } catch (error) {
    console.error("Check out error:", error);
    res.status(500).json({ message: "Failed to check out" });
  }
};

export const getAttendanceLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    const isHR = user?.role.name === "SUPER_ADMIN" || user?.role.name === "ADMIN";
    const { page = 1, limit = 20, targetUserId, startDate, endDate, status } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const where: Record<string, unknown> = {};

    if (!isHR) {
      where.userId = userId;
    } else if (targetUserId) {
      where.userId = Number(targetUserId);
    }

    if (status && status !== "ALL") {
      where.status = String(status);
    }

    if (startDate || endDate) {
      where.date = {
        ...(startDate ? { gte: new Date(String(startDate)) } : {}),
        ...(endDate ? { lte: new Date(String(endDate)) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { date: "desc" },
      }),
      prisma.attendance.count({ where }),
    ]);

    res.json({
      logs,
      total,
      page: pageNum,
      pageSize: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Get attendance logs error:", error);
    res.status(500).json({ message: "Failed to fetch attendance logs" });
  }
};
