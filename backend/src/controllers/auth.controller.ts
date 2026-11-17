import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import {
  generateToken,
  verifyToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from "../utils/jwt.js";
import { sendPasswordResetEmail } from "../services/mail.service.js";

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
        employeeProfile: { include: { department: true } },
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
        avatarUrl: user.avatarUrl ?? null,
        role: user.role.name,
        roleId: user.roleId,
        roleName: user.role.name,
        designation: user.designation?.name ?? null,
        employeeProfile: user.employeeProfile ?? null,
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

export const getMe = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;

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
              include: {
                permission: true,
              },
            },
          },
        },
        designation: true,
        employeeProfile: { include: { department: true } },
      },
    });

    if (!user || user.status !== "ACTIVE") {
      res.status(403).json({ message: "Account is inactive or not found" });
      return;
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber ?? null,
        avatarUrl: user.avatarUrl ?? null,
        role: user.role.name,
        roleId: user.roleId,
        roleName: user.role.name,
        designation: user.designation?.name ?? null,
        employeeProfile: user.employeeProfile ?? null,
        permissions: user.role.permissions.map((rp: { permission: { name: string } }) => rp.permission.name),
      },
    });
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      res.status(400).json({ message: "Please enter a valid work email address" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      res.status(404).json({
        message: "No user account was found with this email address. Please contact HR.",
      });
      return;
    }

    if (user.status !== "ACTIVE") {
      res.status(403).json({
        message: "This account is inactive. Please contact your system administrator.",
      });
      return;
    }

    const resetToken = generatePasswordResetToken(user.id, user.email, user.passwordHash);

    // Determine the frontend base URL
    let frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
    if (!frontendUrl) {
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        try {
          const parsed = new URL(origin);
          frontendUrl = parsed.origin;
        } catch { }
      }
    }
    if (!frontendUrl) {
      frontendUrl = "http://192.168.1.25:3000";
    }

    const resetLink = `${frontendUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}`;

    const mailResult = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetLink,
    });

    res.status(200).json({
      message: `Password reset link has been dispatched to ${user.email}. Please check your Thunderbird mail inbox.`,
      email: user.email,
      fallback: mailResult.fallback,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Unable to process password reset request. Please try again later." });
  }
};

export const verifyResetToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : (req.body?.token as string);

    if (!token) {
      res.status(400).json({ valid: false, message: "Reset token is required" });
      return;
    }

    const payload = verifyPasswordResetToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, passwordHash: true, status: true },
    });

    if (!user || user.status !== "ACTIVE") {
      res.status(400).json({ valid: false, message: "User account not found or inactive" });
      return;
    }

    if (user.passwordHash.slice(-10) !== payload.hashSlice) {
      res.status(400).json({
        valid: false,
        message: "This password reset link has already been used or expired. Please request a new link.",
      });
      return;
    }

    res.status(200).json({
      valid: true,
      email: user.email,
      name: user.name,
    });
  } catch {
    res.status(400).json({
      valid: false,
      message: "The password reset link is invalid or has expired. Please request a fresh one.",
    });
  }
};

export const resetPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== "string") {
      res.status(400).json({ message: "Reset token is missing or invalid" });
      return;
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ message: "New password must be at least 6 characters long" });
      return;
    }

    const payload = verifyPasswordResetToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      res.status(400).json({ message: "User account not found" });
      return;
    }

    if (user.passwordHash.slice(-10) !== payload.hashSlice) {
      res.status(400).json({
        message: "This password reset link has already been used. Please request a new link if needed.",
      });
      return;
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    console.log(`[Auth] Password successfully updated for ${user.email} (ID: ${user.id})`);

    res.status(200).json({
      message: "Your password has been successfully reset. You can now log in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(400).json({
      message: "Invalid or expired reset token. Please request a new password reset link.",
    });
  }
};
