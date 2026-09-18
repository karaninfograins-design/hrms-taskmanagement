import type { Request, Response } from "express";
import { prisma } from "../../config/prisma.js";
import { verifyToken } from "../../utils/jwt.js";

// Helper for permission check
const checkHRAdminPermission = async (userId: number): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  return Boolean(user && (user.role.name === "SUPER_ADMIN" || user.role.name === "ADMIN"));
};

export const getDepartments = async (req: Request, res: Response): Promise<void> => {
  try {
    const departments = await prisma.department.findMany({
      include: {
        _count: {
          select: { employeeProfiles: true },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json({ departments });
  } catch (error) {
    console.error("Get departments error:", error);
    res.status(500).json({ message: "Failed to fetch departments" });
  }
};

export const createDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const hasPerm = await checkHRAdminPermission(userId);
    if (!hasPerm) {
      res.status(403).json({ message: "Only HR/Admins can create departments" });
      return;
    }

    const { name, code, description, status = true } = req.body;

    if (!name || !code) {
      res.status(400).json({ message: "Department name and code are required" });
      return;
    }

    const existingCode = await prisma.department.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (existingCode) {
      res.status(400).json({ message: "Department code already exists" });
      return;
    }

    const department = await prisma.department.create({
      data: {
        name: name.trim(),
        code: code.toUpperCase().trim(),
        description: description ? description.trim() : null,
        status: Boolean(status),
      },
    });

    res.status(201).json({ message: "Department created successfully", department });
  } catch (error) {
    console.error("Create department error:", error);
    res.status(500).json({ message: "Failed to create department" });
  }
};

export const updateDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const { userId } = verifyToken(token);
    const hasPerm = await checkHRAdminPermission(userId);
    if (!hasPerm) {
      res.status(403).json({ message: "Only HR/Admins can update departments" });
      return;
    }

    const deptId = Number(req.params.id);
    const { name, code, description, status } = req.body;

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name.trim();
    if (code) updateData.code = code.toUpperCase().trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (status !== undefined) updateData.status = Boolean(status);

    const department = await prisma.department.update({
      where: { id: deptId },
      data: updateData,
    });

    res.json({ message: "Department updated successfully", department });
  } catch (error) {
    console.error("Update department error:", error);
    res.status(500).json({ message: "Failed to update department" });
  }
};
