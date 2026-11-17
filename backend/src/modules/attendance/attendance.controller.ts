import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";

// Helper to get date components normalized to Indian Standard Time (IST: UTC+5:30)
function getIstComponents(d: Date = new Date()) {
  const istFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = istFormatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      partMap[part.type] = part.value;
    }
  }
  const year = parseInt(partMap.year || String(d.getFullYear()), 10);
  const month = parseInt(partMap.month || String(d.getMonth() + 1), 10);
  const day = parseInt(partMap.day || String(d.getDate()), 10);
  const hours = parseInt(partMap.hour || String(d.getHours()), 10);
  const minutes = parseInt(partMap.minute || String(d.getMinutes()), 10);
  return { year, month, day, hours, minutes };
}

// Helper to get normalized UTC Date for MySQL @db.Date field (YYYY-MM-DD) using IST
function getTodayDbDate(d: Date = new Date()): Date {
  const { year, month, day } = getIstComponents(d);
  const m = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${year}-${m}-${dd}T00:00:00.000Z`);
}

// Helper to get local start and end of day for range queries using IST
function getDayRange(d: Date = new Date()) {
  const dbDate = getTodayDbDate(d);
  const { year, month, day } = getIstComponents(d);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - (5.5 * 60 * 60 * 1000));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - (5.5 * 60 * 60 * 1000));
  return { startOfDay, endOfDay, dbDate };
}

export const getTodayAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const { startOfDay, endOfDay, dbDate } = getDayRange();

    const attendance = await prisma.attendance.findFirst({
      where: {
        userId,
        OR: [
          { date: dbDate },
          { date: { gte: startOfDay, lte: endOfDay } },
        ],
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
    const now = new Date();
    const { startOfDay, endOfDay, dbDate } = getDayRange(now);

    let attendance = await prisma.attendance.findFirst({
      where: {
        userId,
        OR: [
          { date: dbDate },
          { date: { gte: startOfDay, lte: endOfDay } },
        ],
      },
    });

    if (attendance && attendance.checkIn) {
      res.status(400).json({ message: "You have already checked in today" });
      return;
    }

    // 10:00 AM in Indian Standard Time (IST) threshold for LATE
    const { hours } = getIstComponents(now);
    const status = hours >= 10 ? "LATE" : "PRESENT";

    if (attendance) {
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkIn: now,
          status,
        },
      });
    } else {
      try {
        attendance = await prisma.attendance.create({
          data: {
            userId,
            date: dbDate,
            checkIn: now,
            status,
          },
        });
      } catch (createErr: any) {
        // If race condition / unique constraint hit, attempt find & update fallback
        if (createErr?.code === "P2002" || createErr?.message?.includes("Unique constraint")) {
          const existing = await prisma.attendance.findFirst({
            where: {
              userId,
              OR: [
                { date: dbDate },
                { date: { gte: startOfDay, lte: endOfDay } },
              ],
            },
          });
          if (existing) {
            if (existing.checkIn) {
              res.status(400).json({ message: "You have already checked in today" });
              return;
            }
            attendance = await prisma.attendance.update({
              where: { id: existing.id },
              data: { checkIn: now, status },
            });
          } else {
            throw createErr;
          }
        } else {
          throw createErr;
        }
      }
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
    const now = new Date();
    const { startOfDay, endOfDay, dbDate } = getDayRange(now);

    const attendance = await prisma.attendance.findFirst({
      where: {
        userId,
        OR: [
          { date: dbDate },
          { date: { gte: startOfDay, lte: endOfDay } },
        ],
      },
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
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const roleUpper = (user?.role?.name || "").toUpperCase();
    // Privacy restriction: Only SUPER_ADMIN, ADMIN, and sub-role HR can view all logs
    const canViewAllLogs =
      roleUpper === "SUPER_ADMIN" ||
      roleUpper === "ADMIN" ||
      roleUpper === "HR" ||
      roleUpper.includes("HR") ||
      user?.roleId === 1 ||
      user?.roleId === 2 ||
      user?.roleId === 3;

    const { page = 1, limit = 50, targetUserId, startDate, endDate, status, month } = req.query;

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = limit === "ALL" ? 1000 : Math.min(Number(limit) || 50, 1000);
    const where: Record<string, unknown> = {};

    // Normal employees can strictly see only their own attendance logs
    if (!canViewAllLogs) {
      where.userId = userId;
    } else if (targetUserId && targetUserId !== "ALL") {
      const parsedId = Number(targetUserId);
      if (!isNaN(parsedId) && parsedId > 0) {
        where.userId = parsedId;
      }
    }

    if (status && status !== "ALL") {
      where.status = String(status);
    }

    // Month filter (format: YYYY-MM, e.g. 2026-11)
    if (month && typeof month === "string" && month.includes("-")) {
      const parts = month.split("-");
      const yearStr = parts[0];
      const monthStr = parts[1];
      if (yearStr && monthStr) {
        const y = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10);
        if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
          const startOfMonth = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
          const lastDay = new Date(y, m, 0).getDate();
          const endOfMonth = new Date(Date.UTC(y, m - 1, lastDay, 23, 59, 59, 999));
          where.date = {
            gte: startOfMonth,
            lte: endOfMonth,
          };
        }
      }
    } else if (startDate || endDate) {
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
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              designation: { select: { name: true } },
            },
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
