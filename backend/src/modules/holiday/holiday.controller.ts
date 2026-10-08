import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";

const isUserHrOrAdmin = async (userId: number): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user) return false;
  const roleName = user.role?.name || "";
  return roleName === "ADMIN" || roleName === "SUPER_ADMIN" || roleName === "HR";
};

export const getHolidays = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    verifyToken(token);

    const holidays = await prisma.companyHoliday.findMany({
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { date: "asc" },
    });

    res.json({ holidays });
  } catch (error) {
    console.error("Get holidays error:", error);
    res.status(500).json({ message: "Failed to fetch company holidays" });
  }
};

export const createHoliday = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const authorized = await isUserHrOrAdmin(userId);

    if (!authorized) {
      res.status(403).json({ message: "Only HR and Admins can create company holidays" });
      return;
    }

    const { title, description, date, type = "OFFICIAL_HOLIDAY" } = req.body;

    if (!title || !date) {
      res.status(400).json({ message: "Title and date are required" });
      return;
    }

    const holiday = await prisma.companyHoliday.create({
      data: {
        title: title.trim(),
        description: description ? description.trim() : null,
        date: new Date(date),
        type,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json({ holiday });
  } catch (error) {
    console.error("Create holiday error:", error);
    res.status(500).json({ message: "Failed to create holiday" });
  }
};

export const updateHoliday = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const authorized = await isUserHrOrAdmin(userId);
    if (!authorized) {
      res.status(403).json({ message: "Only HR and Admins can update company holidays" });
      return;
    }

    const holidayId = Number(req.params.id);
    const { title, description, date, type } = req.body;

    const updated = await prisma.companyHoliday.update({
      where: { id: holidayId },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
        ...(date && { date: new Date(date) }),
        ...(type && { type }),
      },
    });

    res.json({ holiday: updated });
  } catch (error) {
    console.error("Update holiday error:", error);
    res.status(500).json({ message: "Failed to update holiday" });
  }
};

export const deleteHoliday = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const authorized = await isUserHrOrAdmin(userId);
    if (!authorized) {
      res.status(403).json({ message: "Only HR and Admins can delete company holidays" });
      return;
    }

    const holidayId = Number(req.params.id);

    await prisma.companyHoliday.delete({
      where: { id: holidayId },
    });

    res.json({ message: "Holiday deleted successfully" });
  } catch (error) {
    console.error("Delete holiday error:", error);
    res.status(500).json({ message: "Failed to delete holiday" });
  }
};
