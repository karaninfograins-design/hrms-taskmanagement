import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { hashPassword } from "../utils/password.js";
import { verifyToken } from "../utils/jwt.js";

export const getAdmins = async (req: Request, res: Response): Promise<void> => {
  try {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;

    if (!token) {
      res.status(401).json({ message: "Authentication is required" });
      return;
    }

    const { userId } = verifyToken(token);
    const requestingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!requestingUser || (requestingUser.role.name !== "SUPER_ADMIN" && requestingUser.role.name !== "ADMIN")) {
      res.status(403).json({ message: "Access denied. Only administrators can view admin list" });
      return;
    }

    const admins = await prisma.user.findMany({
      where: {
        role: {
          name: { in: ["SUPER_ADMIN", "ADMIN"] },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ admins });
  } catch (error) {
    console.error("Get admins error:", error);
    res.status(500).json({ message: "Failed to fetch administrators" });
  }
};

export const createAdmin = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    if (!token) {
      res.status(401).json({ message: "Authentication is required" });
      return;
    }

    const { userId } = verifyToken(token);
    const requestingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!requestingUser || requestingUser.role.name !== "SUPER_ADMIN") {
      res.status(403).json({ message: "Only a super admin can create administrators" });
      return;
    }

    const { name, email, password } = req.body as Record<string, unknown>;
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      password.length < 8
    ) {
      res.status(400).json({
        message: "Name, email, and a password of at least 8 characters are required",
      });
      return;
    }

    const adminRole = await prisma.role.findUnique({
      where: { name: "ADMIN" },
    });
    if (!adminRole) {
      res.status(500).json({ message: "ADMIN role is not seeded" });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existingUser) {
      res.status(409).json({ message: "A user with this email already exists" });
      return;
    }

    const admin = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
        roleId: adminRole.id,
      },
      select: { id: true, name: true, email: true, status: true },
    });

    res.status(201).json({ message: "Administrator created", admin });
  } catch (error) {
    console.error("Create admin error:", error);
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
};
