import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";

const checkHRAdminPermission = async (userId: number): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  return Boolean(user && (user.role.name === "SUPER_ADMIN" || user.role.name === "ADMIN"));
};

export const getLeaveTypes = async (req: Request, res: Response): Promise<void> => {
  try {
    let types = await prisma.leaveType.findMany({
      where: { status: true },
      orderBy: { name: "asc" },
    });

    if (types.length === 0) {
      // Seed default leave types if empty
      await prisma.leaveType.createMany({
        data: [
          { name: "Casual Leave", daysAllowed: 12, description: "Personal and casual leaves" },
          { name: "Sick Leave", daysAllowed: 10, description: "Medical and health leaves" },
          { name: "Earned Leave", daysAllowed: 15, description: "Paid annual leave" },
          { name: "Unpaid Leave", daysAllowed: 30, description: "Leave without pay" },
        ],
      });
      types = await prisma.leaveType.findMany({ where: { status: true } });
    }

    res.json({ types });
  } catch (error) {
    console.error("Get leave types error:", error);
    res.status(500).json({ message: "Failed to fetch leave types" });
  }
};

export const getLeaveBalances = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const year = new Date().getFullYear();

    const types = await prisma.leaveType.findMany({ where: { status: true } });

    // Initialize missing balances for current user
    for (const type of types) {
      const existing = await prisma.leaveBalance.findUnique({
        where: {
          userId_leaveTypeId_year: {
            userId,
            leaveTypeId: type.id,
            year,
          },
        },
      });

      if (!existing) {
        await prisma.leaveBalance.create({
          data: {
            userId,
            leaveTypeId: type.id,
            allocated: type.daysAllowed,
            used: 0,
            remaining: type.daysAllowed,
            year,
          },
        });
      }
    }

    const balances = await prisma.leaveBalance.findMany({
      where: { userId, year },
      include: { leaveType: true },
    });

    res.json({ balances });
  } catch (error) {
    console.error("Get leave balances error:", error);
    res.status(500).json({ message: "Failed to fetch leave balances" });
  }
};

export const getLeaveRequests = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);

    const { page = 1, limit = 20, status } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const where: Record<string, unknown> = {};
    if (!isHR) {
      where.userId = userId;
    }

    if (status && status !== "ALL") {
      where.status = String(status);
    }

    const [requests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          leaveType: true,
          approvedBy: { select: { id: true, name: true } },
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    res.json({
      requests,
      total,
      page: pageNum,
      pageSize: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Get leave requests error:", error);
    res.status(500).json({ message: "Failed to fetch leave requests" });
  }
};

export const applyLeave = async (req: Request, res: Response): Promise<void> => {
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

    if (user?.role?.name === "SUPER_ADMIN") {
      res.status(403).json({ message: "SuperAdmins cannot submit leave requests. Leave applications are managed via HR." });
      return;
    }

    const { leaveTypeId, startDate, endDate, reason } = req.body;

    if (!leaveTypeId || !startDate || !endDate || !reason) {
      res.status(400).json({ message: "Leave type, start date, end date, and reason are required" });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      res.status(400).json({ message: "End date cannot be before start date" });
      return;
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const request = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId: Number(leaveTypeId),
        startDate: start,
        endDate: end,
        totalDays,
        reason: reason.trim(),
        status: "PENDING",
      },
      include: {
        leaveType: true,
      },
    });

    res.status(201).json({ message: "Leave request submitted successfully", request });
  } catch (error) {
    console.error("Apply leave error:", error);
    res.status(500).json({ message: "Failed to submit leave request" });
  }
};

export const updateLeaveStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);
    if (!isHR) {
      res.status(403).json({ message: "Only HR/Admins can approve or reject leaves" });
      return;
    }

    const requestId = Number(req.params.id);
    const { status, rejectionReason } = req.body;

    if (!["APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
      res.status(400).json({ message: "Invalid leave status" });
      return;
    }

    const leaveRequest = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!leaveRequest) {
      res.status(404).json({ message: "Leave request not found" });
      return;
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status,
        approvedById: userId,
        approvedAt: new Date(),
        rejectionReason: rejectionReason ? rejectionReason.trim() : null,
      },
    });

    // Deduct balance if APPROVED
    if (status === "APPROVED") {
      const year = new Date().getFullYear();
      await prisma.leaveBalance.updateMany({
        where: {
          userId: leaveRequest.userId,
          leaveTypeId: leaveRequest.leaveTypeId,
          year,
        },
        data: {
          used: { increment: leaveRequest.totalDays },
          remaining: { decrement: leaveRequest.totalDays },
        },
      });
    }

    res.json({ message: `Leave request ${status.toLowerCase()} successfully`, request: updated });
  } catch (error) {
    console.error("Update leave status error:", error);
    res.status(500).json({ message: "Failed to update leave status" });
  }
};
