import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { comparePassword } from "../utils/password.js";
import { generateToken } from "../utils/jwt.js";

export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        message: "Email and password are required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        designation: true,
      },
    });

    if (!user) {
      res.status(401).json({
        message: "Invalid email or password",
      });
      return;
    }

    if (user.status !== "ACTIVE") {
      res.status(403).json({
        message: "Your account is inactive",
      });
      return;
    }

    const passwordMatch = await comparePassword(
      password,
      user.passwordHash
    );

    if (!passwordMatch) {
      res.status(401).json({
        message: "Invalid email or password",
      });
      return;
    }

    const token = generateToken(user.id);

    res.status(200).json({
      message: "Login successful",

      token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber ?? null,
        role: user.role.name,
        designation: user.designation?.name ?? null,
        permissions: user.role.permissions.map((rp: { permission: { name: string } }) => rp.permission.name),
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
};
