import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";
import { createNotificationsForUsers } from "../../controllers/notification.controller.js";

const checkHRAdminPermission = async (userId: number): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      designation: true,
    },
  });
  if (!user) return false;
  const roleName = (user.role?.name || "").toUpperCase();
  const desigName = (user.designation?.name || "").toUpperCase();
  const email = (user.email || "").toLowerCase();

  if (
    roleName === "SUPER_ADMIN" ||
    roleName === "ADMIN" ||
    roleName === "HR" ||
    roleName === "HR_MANAGER" ||
    roleName.includes("HR") ||
    roleName.includes("ADMIN") ||
    desigName.includes("HR") ||
    email.includes("hr@") ||
    user.roleId === 1 ||
    user.roleId === 2 ||
    user.roleId === 3
  ) {
    return true;
  }
  const permissions = (user.role as any)?.permissions?.map((p: any) => p.permission?.name) || [];
  return (
    permissions.includes("leave:manage") ||
    permissions.includes("leave:approve") ||
    permissions.includes("MANAGE_LEAVES") ||
    permissions.includes("MANAGE_EMPLOYEES")
  );
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
          { name: "Compensatory Off", daysAllowed: 12, description: "Compensatory off for extra working hours" },
        ],
      });
      types = await prisma.leaveType.findMany({ where: { status: true }, orderBy: { name: "asc" } });
    } else {
      // Ensure Compensatory Off is present
      const compOffExists = types.some((t) => t.name.toLowerCase().includes("comp"));
      if (!compOffExists) {
        await prisma.leaveType.create({
          data: {
            name: "Compensatory Off",
            daysAllowed: 12,
            description: "Compensatory off for extra working hours",
          },
        });
        types = await prisma.leaveType.findMany({ where: { status: true }, orderBy: { name: "asc" } });
      }
    }

    res.json({ types });
  } catch (error) {
    console.error("Get leave types error:", error);
    res.status(500).json({ message: "Failed to fetch leave types" });
  }
};

export const createLeaveType = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);
    if (!isHR) {
      res.status(403).json({ message: "Only HR/Admins can manage leave types" });
      return;
    }

    const { name, daysAllowed, description } = req.body;
    if (!name || daysAllowed === undefined) {
      res.status(400).json({ message: "Name and daysAllowed are required" });
      return;
    }

    const leaveType = await prisma.leaveType.create({
      data: {
        name: String(name).trim(),
        daysAllowed: Number(daysAllowed),
        description: description ? String(description).trim() : null,
      },
    });

    res.status(201).json({ message: "Leave type created successfully", leaveType });
  } catch (error) {
    console.error("Create leave type error:", error);
    res.status(500).json({ message: "Failed to create leave type" });
  }
};

export const updateLeaveType = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);
    if (!isHR) {
      res.status(403).json({ message: "Only HR/Admins can manage leave types" });
      return;
    }

    const id = Number(req.params.id);
    const { name, daysAllowed, description, status } = req.body;

    const leaveType = await prisma.leaveType.update({
      where: { id },
      data: {
        ...(name ? { name: String(name).trim() } : {}),
        ...(daysAllowed !== undefined ? { daysAllowed: Number(daysAllowed) } : {}),
        ...(description !== undefined ? { description: String(description).trim() } : {}),
        ...(status !== undefined ? { status: Boolean(status) } : {}),
      },
    });

    res.json({ message: "Leave type updated successfully", leaveType });
  } catch (error) {
    console.error("Update leave type error:", error);
    res.status(500).json({ message: "Failed to update leave type" });
  }
};

export const deleteLeaveType = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);
    if (!isHR) {
      res.status(403).json({ message: "Only HR/Admins can manage leave types" });
      return;
    }

    const id = Number(req.params.id);
    await prisma.leaveType.update({
      where: { id },
      data: { status: false },
    });

    res.json({ message: "Leave type removed successfully" });
  } catch (error) {
    console.error("Delete leave type error:", error);
    res.status(500).json({ message: "Failed to delete leave type" });
  }
};

export const getAllEmployeeBalances = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);
    if (!isHR) {
      res.status(403).json({ message: "Only HR/Admins can view employee leave balances" });
      return;
    }

    const year = new Date().getFullYear();

    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        email: true,
        designation: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    const formattedUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      designation: u.designation?.name || null,
    }));

    const balances = await prisma.leaveBalance.findMany({
      where: { year },
      include: {
        user: { select: { id: true, name: true, email: true } },
        leaveType: true,
      },
      orderBy: { userId: "asc" },
    });

    res.json({ users: formattedUsers, balances });
  } catch (error) {
    console.error("Get all employee balances error:", error);
    res.status(500).json({ message: "Failed to fetch employee balances" });
  }
};

export const updateEmployeeBalance = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);
    if (!isHR) {
      res.status(403).json({ message: "Only HR/Admins can update employee leave balances" });
      return;
    }

    const balanceId = Number(req.params.id);
    const { allocated, used, remaining } = req.body;

    const balance = await prisma.leaveBalance.update({
      where: { id: balanceId },
      data: {
        ...(allocated !== undefined ? { allocated: Number(allocated) } : {}),
        ...(used !== undefined ? { used: Number(used) } : {}),
        ...(remaining !== undefined ? { remaining: Number(remaining) } : {}),
      },
      include: { leaveType: true, user: { select: { id: true, name: true, email: true } } },
    });

    res.json({ message: "Employee leave balance updated successfully", balance });
  } catch (error) {
    console.error("Update employee balance error:", error);
    res.status(500).json({ message: "Failed to update employee leave balance" });
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

    const { page = 1, limit = 200, status } = req.query;
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

    const { leaveTypeId, startDate, endDate, isHalfDay, halfDayPeriod, reason } = req.body;

    if (
      !Number.isInteger(Number(leaveTypeId)) ||
      Number(leaveTypeId) <= 0 ||
      !startDate ||
      !endDate ||
      typeof reason !== "string" ||
      !reason.trim() ||
      (req.body.isHalfDay !== undefined && typeof req.body.isHalfDay !== "boolean")
    ) {
      res.status(400).json({ message: "Leave type, start date, end date, and reason are required" });
      return;
    }

    if (typeof startDate !== "string" || typeof endDate !== "string") {
      res.status(400).json({ message: "Start date and end date must be valid dates" });
      return;
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start.toISOString().slice(0, 10) !== startDate ||
      end.toISOString().slice(0, 10) !== endDate
    ) {
      res.status(400).json({ message: "Start date and end date must be valid dates" });
      return;
    }

    if (end < start) {
      res.status(400).json({ message: "End date cannot be before start date" });
      return;
    }

    const isHalfDayRequest = isHalfDay === true;
    if (
      isHalfDayRequest &&
      (startDate !== endDate || !["FIRST_HALF", "SECOND_HALF"].includes(halfDayPeriod))
    ) {
      res.status(400).json({
        message: "Half-day leave must be for one date and specify first half or second half",
      });
      return;
    }

    const totalDays = isHalfDayRequest
      ? 0.5
      : Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const request = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId: Number(leaveTypeId),
        startDate: start,
        endDate: end,
        totalDays,
        halfDayPeriod: isHalfDayRequest ? halfDayPeriod : null,
        reason: reason.trim(),
        status: "PENDING",
      },
      include: {
        leaveType: true,
      },
    });

    // Notify HR and Admins about the new leave request
    try {
      const hrAdminUsers = await prisma.user.findMany({
        where: {
          role: {
            name: { in: ["SUPER_ADMIN", "ADMIN", "HR", "HR_MANAGER"] },
          },
        },
        select: { id: true },
      });
      const recipientIds = hrAdminUsers.map((u) => u.id).filter((id) => id !== userId);
      if (recipientIds.length > 0) {
        const applicantName = user?.name || "An employee";
        void createNotificationsForUsers(
          recipientIds,
          "LEAVE_APPLICATION",
          "New Leave Application",
          `${applicantName} submitted a leave request for ${totalDays} day(s) of ${request.leaveType.name} (${startDate} to ${endDate}).`,
          "/dashboard/leaves"
        );
      }
    } catch (notifErr) {
      console.warn("Could not dispatch leave application notification:", notifErr);
    }

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

    // Notify employee of approval or rejection
    try {
      const approver = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const approverName = approver?.name || "HR Manager";
      const statusAction = status === "APPROVED" ? "approved" : "rejected";
      const reasonDetail = status === "REJECTED" && rejectionReason ? ` Reason: ${rejectionReason.trim()}` : "";
      void createNotificationsForUsers(
        [leaveRequest.userId],
        "LEAVE_STATUS",
        `Leave Request ${status}`,
        `Your leave request for ${leaveRequest.totalDays} day(s) has been ${statusAction} by ${approverName}.${reasonDetail}`,
        "/dashboard/leaves"
      );
    } catch (notifErr) {
      console.warn("Could not dispatch leave status notification:", notifErr);
    }

    res.json({ message: `Leave request ${status.toLowerCase()} successfully`, request: updated });
  } catch (error) {
    console.error("Update leave status error:", error);
    res.status(500).json({ message: "Failed to update leave status" });
  }
};

export const updateLeaveRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);
    const requestId = Number(req.params.id);

    const existing = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!existing) {
      res.status(404).json({ message: "Leave request not found" });
      return;
    }

    if (!isHR && existing.userId !== userId) {
      res.status(403).json({ message: "You can only edit your own leave requests" });
      return;
    }

    if (existing.status !== "PENDING" && !isHR) {
      res.status(400).json({ message: "Cannot edit a leave request that has already been approved or rejected" });
      return;
    }

    const { leaveTypeId, startDate, endDate, isHalfDay, halfDayPeriod, reason } = req.body;

    if (
      !Number.isInteger(Number(leaveTypeId)) ||
      Number(leaveTypeId) <= 0 ||
      !startDate ||
      !endDate ||
      typeof reason !== "string" ||
      !reason.trim()
    ) {
      res.status(400).json({ message: "Leave type, start date, end date, and reason are required" });
      return;
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    if (end < start) {
      res.status(400).json({ message: "End date cannot be before start date" });
      return;
    }

    const isHalfDayRequest = isHalfDay === true;
    if (
      isHalfDayRequest &&
      (startDate !== endDate || !["FIRST_HALF", "SECOND_HALF"].includes(halfDayPeriod))
    ) {
      res.status(400).json({
        message: "Half-day leave must be for one date and specify first half or second half",
      });
      return;
    }

    const totalDays = isHalfDayRequest
      ? 0.5
      : Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const updated = await prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        leaveTypeId: Number(leaveTypeId),
        startDate: start,
        endDate: end,
        totalDays,
        halfDayPeriod: isHalfDayRequest ? halfDayPeriod : null,
        reason: reason.trim(),
      },
      include: {
        leaveType: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ message: "Leave request updated successfully", request: updated });
  } catch (error) {
    console.error("Update leave request error:", error);
    res.status(500).json({ message: "Failed to update leave request" });
  }
};

export const deleteLeaveRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const isHR = await checkHRAdminPermission(userId);
    const requestId = Number(req.params.id);

    const existing = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
    if (!existing) {
      res.status(404).json({ message: "Leave request not found" });
      return;
    }

    if (!isHR && existing.userId !== userId) {
      res.status(403).json({ message: "You can only cancel your own leave requests" });
      return;
    }

    if (existing.status !== "PENDING" && !isHR) {
      res.status(400).json({ message: "Cannot cancel a leave request that has already been approved or rejected" });
      return;
    }

    // If an approved leave is deleted by HR, restore the balance
    if (existing.status === "APPROVED") {
      const year = new Date().getFullYear();
      await prisma.leaveBalance.updateMany({
        where: { userId: existing.userId, leaveTypeId: existing.leaveTypeId, year },
        data: {
          used: { decrement: existing.totalDays },
          remaining: { increment: existing.totalDays },
        },
      });
    }

    await prisma.leaveRequest.delete({ where: { id: requestId } });
    res.json({ message: "Leave request cancelled successfully" });
  } catch (error) {
    console.error("Delete leave request error:", error);
    res.status(500).json({ message: "Failed to delete leave request" });
  }
};
