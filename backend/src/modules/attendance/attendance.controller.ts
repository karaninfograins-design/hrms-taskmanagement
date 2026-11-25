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

export const MAX_SHIFT_HOURS = 12;
export const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

// Helper to automatically close any attendance records where checkIn is >= 12 hours ago and checkOut is null
export async function autoCloseExpiredAttendances(userId?: number): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_SHIFT_MS);

  const whereClause: any = {
    checkIn: { lte: cutoff },
    checkOut: null,
  };
  if (userId) {
    whereClause.userId = userId;
  }

  const expiredRecords = await prisma.attendance.findMany({
    where: whereClause,
  });

  for (const record of expiredRecords) {
    if (!record.checkIn) continue;
    const checkInDate = new Date(record.checkIn);
    const autoCheckOut = new Date(checkInDate.getTime() + MAX_SHIFT_MS);
    await prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOut: autoCheckOut,
        workingHours: 12.0,
        status: record.status === "LATE" ? "LATE" : "PRESENT",
        remarks: record.remarks
          ? `${record.remarks} | Auto clocked out (12-hr shift limit)`
          : "Auto clocked out (12-hr shift limit)",
      },
    });
  }
}

export const getTodayAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    
    // Auto-close any unclosed shifts >= 12 hrs
    await autoCloseExpiredAttendances(userId);

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
      orderBy: { createdAt: "desc" },
    });

    // In-memory verification: if current attendance reached 12 hours, auto-close it
    if (attendance && attendance.checkIn && !attendance.checkOut) {
      const elapsedMs = now.getTime() - new Date(attendance.checkIn).getTime();
      if (elapsedMs >= MAX_SHIFT_MS) {
        const autoCheckOut = new Date(new Date(attendance.checkIn).getTime() + MAX_SHIFT_MS);
        attendance = await prisma.attendance.update({
          where: { id: attendance.id },
          data: {
            checkOut: autoCheckOut,
            workingHours: 12.0,
            status: attendance.status === "LATE" ? "LATE" : "PRESENT",
            remarks: attendance.remarks
              ? `${attendance.remarks} | Auto clocked out (12-hr shift limit)`
              : "Auto clocked out (12-hr shift limit)",
          },
        });
      }
    }

    // Determine if the user can clock in:
    // 1. If no attendance record exists today, canClockIn = true
    // 2. If an attendance record exists, but has checked out and >= 12 hours have passed since checkIn, canClockIn = true
    let canClockIn = false;
    if (!attendance || !attendance.checkIn) {
      canClockIn = true;
    } else if (attendance.checkOut) {
      const elapsedSinceCheckIn = now.getTime() - new Date(attendance.checkIn).getTime();
      if (elapsedSinceCheckIn >= MAX_SHIFT_MS) {
        canClockIn = true;
      }
    }

    res.json({ attendance, canClockIn });
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

    // Auto-close any unclosed shifts >= 12 hrs first
    await autoCloseExpiredAttendances(userId);

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
      orderBy: { createdAt: "desc" },
    });

    // If an open shift exists, check if 12 hours have passed
    if (attendance && attendance.checkIn && !attendance.checkOut) {
      const elapsedMs = now.getTime() - new Date(attendance.checkIn).getTime();
      if (elapsedMs < MAX_SHIFT_MS) {
        res.status(400).json({ message: "You are already clocked in. Please clock out before starting a new shift." });
        return;
      } else {
        // 12 hours passed, auto-close it
        const autoCheckOut = new Date(new Date(attendance.checkIn).getTime() + MAX_SHIFT_MS);
        attendance = await prisma.attendance.update({
          where: { id: attendance.id },
          data: {
            checkOut: autoCheckOut,
            workingHours: 12.0,
            status: attendance.status === "LATE" ? "LATE" : "PRESENT",
            remarks: attendance.remarks
              ? `${attendance.remarks} | Auto clocked out (12-hr shift limit)`
              : "Auto clocked out (12-hr shift limit)",
          },
        });
      }
    }

    // 10:00 AM in Indian Standard Time (IST) threshold for LATE
    const { hours } = getIstComponents(now);
    const status = hours >= 10 ? "LATE" : "PRESENT";

    // If already checked out today
    if (attendance && attendance.checkIn && attendance.checkOut) {
      const elapsedSinceCheckIn = now.getTime() - new Date(attendance.checkIn).getTime();
      if (elapsedSinceCheckIn < MAX_SHIFT_MS) {
        res.status(400).json({ message: "Shift completed for today. You can clock in again after 12 hours from your last check-in." });
        return;
      }

      // >= 12 hours have passed! Start new shift on today's record (accumulating working hours)
      const prevHours = attendance.workingHours || 12.0;
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkIn: now,
          checkOut: null,
          status,
          workingHours: prevHours,
          remarks: attendance.remarks
            ? `${attendance.remarks} | Re-clocked in after 12 hrs`
            : "Re-clocked in after 12 hrs",
        },
      });

      res.json({ message: "Checked in successfully", attendance });
      return;
    }

    if (attendance) {
      attendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkIn: now,
          checkOut: null,
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
            attendance = await prisma.attendance.update({
              where: { id: existing.id },
              data: { checkIn: now, checkOut: null, status },
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
  } catch (error: any) {
    console.error("Check in error:", error);
    res.status(500).json({ message: error?.message || "Failed to check in" });
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
      orderBy: { createdAt: "desc" },
    });

    if (!attendance || !attendance.checkIn) {
      res.status(400).json({ message: "You must check in before checking out" });
      return;
    }

    if (attendance.checkOut) {
      res.status(400).json({ message: "You have already checked out of this shift" });
      return;
    }

    const checkInTime = new Date(attendance.checkIn).getTime();
    const durationMs = now.getTime() - checkInTime;

    // Cap duration at 12 hours (counting max 12 hrs)
    const isOver12Hours = durationMs >= MAX_SHIFT_MS;
    const cappedMs = isOver12Hours ? MAX_SHIFT_MS : durationMs;
    const currentShiftHours = Number((cappedMs / (1000 * 60 * 60)).toFixed(2));
    const effectiveCheckOut = isOver12Hours
      ? new Date(checkInTime + MAX_SHIFT_MS)
      : now;

    const totalWorkingHours = attendance.remarks?.includes("Re-clocked in after 12 hrs")
      ? Number(((attendance.workingHours || 0) + currentShiftHours).toFixed(2))
      : currentShiftHours;

    const remarks = isOver12Hours
      ? (attendance.remarks ? `${attendance.remarks} | Capped at 12 hrs max shift` : "Capped at 12 hrs max shift")
      : attendance.remarks;

    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: effectiveCheckOut,
        workingHours: totalWorkingHours,
        status: totalWorkingHours < 4 ? "HALF_DAY" : attendance.status,
        remarks,
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

    // Auto-close any expired open shifts across all users before fetching logs
    await autoCloseExpiredAttendances();
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
