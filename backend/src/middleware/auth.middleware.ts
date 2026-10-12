import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { verifyToken } from "../utils/jwt.js";

export async function authenticateUser(req: Request, res: Response) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;

  if (!token) {
    res.status(401).json({ message: "Authentication is required" });
    return null;
  }

  try {
    const { userId } = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || user.status !== "ACTIVE") {
      res.status(403).json({ message: "Account is inactive or not found" });
      return null;
    }

    return user;
  } catch {
    res.status(401).json({ message: "Invalid or expired authentication token" });
    return null;
  }
}
