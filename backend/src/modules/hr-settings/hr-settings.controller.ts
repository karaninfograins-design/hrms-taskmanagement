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

export const getHRSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.query;
    const where: Record<string, unknown> = { status: true };

    if (category) {
      where.category = String(category);
    }

    const settings = await prisma.hRSetting.findMany({
      where,
      orderBy: [{ category: "asc" }, { value: "asc" }],
    });

    res.json({ settings });
  } catch (error) {
    console.error("Get HR settings error:", error);
    res.status(500).json({ message: "Failed to fetch HR settings" });
  }
};

export const createHRSetting = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const hasPerm = await checkHRAdminPermission(userId);
    if (!hasPerm) {
      res.status(403).json({ message: "Only HR/Admins can manage HR settings" });
      return;
    }

    const { category, key, value } = req.body;

    if (!category || !key || !value) {
      res.status(400).json({ message: "Category, key, and value are required" });
      return;
    }

    const setting = await prisma.hRSetting.create({
      data: {
        category: String(category).toUpperCase().trim(),
        key: String(key).toUpperCase().trim(),
        value: String(value).trim(),
      },
    });

    res.status(201).json({ message: "HR Setting added successfully", setting });
  } catch (error) {
    console.error("Create HR setting error:", error);
    res.status(500).json({ message: "Failed to create HR setting" });
  }
};

export const updateHRSetting = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const hasPerm = await checkHRAdminPermission(userId);
    if (!hasPerm) {
      res.status(403).json({ message: "Only HR/Admins can manage HR settings" });
      return;
    }

    const id = Number(req.params.id);
    const { value, status } = req.body;

    const setting = await prisma.hRSetting.update({
      where: { id },
      data: {
        ...(value ? { value: String(value).trim() } : {}),
        ...(status !== undefined ? { status: Boolean(status) } : {}),
      },
    });

    res.json({ message: "HR Setting updated successfully", setting });
  } catch (error) {
    console.error("Update HR setting error:", error);
    res.status(500).json({ message: "Failed to update HR setting" });
  }
};
