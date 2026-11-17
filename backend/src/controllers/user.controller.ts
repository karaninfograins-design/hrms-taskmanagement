import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../config/prisma.js";
import { verifyToken } from "../utils/jwt.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { emitUserUpdated } from "../socket.js";

async function authenticate(req: Request, res: Response) {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ message: "Authentication is required" });
    return false;
  }

  try {
    const { userId } = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user || user.status !== "ACTIVE") {
      res.status(403).json({ message: "Your account is inactive or not found" });
      return false;
    }
    return user;
  } catch {
    res.status(401).json({ message: "Invalid or expired authentication token" });
    return false;
  }
}

export async function getProfile(req: Request, res: Response) {
  const authUser = await authenticate(req, res);
  if (!authUser) return;

  const targetIdParam = req.params.id;
  const targetUserId = targetIdParam === "me" ? authUser.id : Number(targetIdParam);

  if (Number.isNaN(targetUserId)) {
    res.status(400).json({ message: "Invalid user ID" });
    return;
  }

  const isAdmin = authUser.role.name === "ADMIN" || authUser.role.name === "SUPER_ADMIN";
  if (authUser.id !== targetUserId && !isAdmin) {
    res.status(403).json({ message: "Not authorized to view this profile" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        designation: true,
        employeeProfile: { include: { department: true } },
      },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
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
        roleId: user.role.id,
        designation: user.designation?.name ?? null,
        employeeProfile: user.employeeProfile,
        permissions: user.role.permissions.map((rp: { permission: { name: string } }) => rp.permission.name),
      },
    });
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
}

export async function updateProfile(req: Request, res: Response) {
  const authUser = await authenticate(req, res);
  if (!authUser) return;

  const targetIdParam = req.params.id;
  const targetUserId = targetIdParam === "me" ? authUser.id : Number(targetIdParam);

  if (Number.isNaN(targetUserId)) {
    res.status(400).json({ message: "Invalid user ID" });
    return;
  }

  // Users can only update their own profile unless they are ADMIN or SUPER_ADMIN
  const isAdmin = authUser.role.name === "ADMIN" || authUser.role.name === "SUPER_ADMIN";
  if (authUser.id !== targetUserId && !isAdmin) {
    res.status(403).json({ message: "You are not authorized to edit another user's profile" });
    return;
  }

  const { name, email, phoneNumber, avatarUrl, dob, gender, address, workLocation, employmentType, departmentId, designation } = req.body as {
    name?: string;
    email?: string;
    phoneNumber?: string;
    avatarUrl?: string | null;
    designation?: string | number;
    dob?: string;
    gender?: string;
    address?: string;
    workLocation?: string;
    employmentType?: string;
    departmentId?: number;
  };

  try {
    const updateData: {
      name?: string;
      email?: string;
      phoneNumber?: string | null;
      avatarUrl?: string | null;
      designationId?: number | null;
    } = {};

    if (typeof name === "string" && name.trim()) updateData.name = name.trim();
    if (typeof phoneNumber === "string") updateData.phoneNumber = phoneNumber.trim() || null;
    if (avatarUrl !== undefined) updateData.avatarUrl = typeof avatarUrl === "string" ? avatarUrl.trim() || null : null;
    if (typeof email === "string" && email.trim()) {
      const lowerEmail = email.trim().toLowerCase();
      // Check duplicate email
      const existing = await prisma.user.findUnique({ where: { email: lowerEmail } });
      if (existing && existing.id !== targetUserId) {
        res.status(409).json({ message: "An account with this email already exists" });
        return;
      }
      updateData.email = lowerEmail;
    }

    // Handle designation update
    if (typeof designation === "string") {
      const trimmedDesig = designation.trim();
      if (trimmedDesig) {
        let desigRecord = await prisma.designation.findFirst({
          where: { name: trimmedDesig },
        });
        if (!desigRecord) {
          desigRecord = await prisma.designation.create({
            data: { name: trimmedDesig },
          });
        }
        updateData.designationId = desigRecord.id;
      } else {
        updateData.designationId = null;
      }
    } else if (typeof designation === "number") {
      updateData.designationId = designation;
    }

    // Sync EmployeeProfile first
    const profile = await prisma.employeeProfile.upsert({
      where: { userId: targetUserId },
      update: {
        ...(dob && { dob: new Date(dob) }),
        ...(gender !== undefined && { gender }),
        ...(address !== undefined && { address }),
        ...(workLocation && { workLocation }),
        ...(employmentType && { employmentType }),
        ...(departmentId !== undefined && { departmentId: departmentId ? Number(departmentId) : null }),
      },
      create: {
        userId: targetUserId,
        employeeCode: `EMP-${targetUserId}`,
        dob: dob ? new Date(dob) : null,
        gender: gender || null,
        address: address || null,
        workLocation: workLocation || "OFFICE",
        employmentType: employmentType || "FULL_TIME",
        departmentId: departmentId ? Number(departmentId) : null,
      },
      include: { department: true },
    });

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        designation: true,
        employeeProfile: { include: { department: true } },
      },
    });

    const userResponse = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber ?? null,
      avatarUrl: updatedUser.avatarUrl ?? null,
      role: updatedUser.role.name,
      roleId: updatedUser.role.id,
      designation: updatedUser.designation?.name ?? null,
      employeeProfile: updatedUser.employeeProfile,
      permissions: updatedUser.role.permissions.map((rp: { permission: { name: string } }) => rp.permission.name),
    };

    emitUserUpdated(userResponse);

    res.json({
      message: "Profile updated successfully",
      user: userResponse,
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ message: "Failed to update profile" });
  }
}

export async function changePassword(req: Request, res: Response) {
  const authUser = await authenticate(req, res);
  if (!authUser) return;

  const targetIdParam = req.params.id;
  const targetUserId = targetIdParam === "me" ? authUser.id : Number(targetIdParam);

  if (Number.isNaN(targetUserId)) {
    res.status(400).json({ message: "Invalid user ID" });
    return;
  }

  const isAdmin = authUser.role.name === "ADMIN" || authUser.role.name === "SUPER_ADMIN";
  if (authUser.id !== targetUserId && !isAdmin) {
    res.status(403).json({ message: "You are not authorized to change password for this account" });
    return;
  }

  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ message: "New password must be at least 8 characters long" });
    return;
  }

  try {
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    // Require current password verification if user is changing their own password
    if (authUser.id === targetUserId) {
      if (!currentPassword) {
        res.status(400).json({ message: "Current password is required" });
        return;
      }
      const isMatch = await comparePassword(currentPassword, targetUser.passwordHash);
      if (!isMatch) {
        res.status(400).json({ message: "Current password is incorrect" });
        return;
      }
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash: newPasswordHash },
    });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Error changing password:", err);
    res.status(500).json({ message: "Failed to change password" });
  }
}

export async function uploadAvatar(req: Request, res: Response) {
  const authUser = await authenticate(req, res);
  if (!authUser) return;

  const targetIdParam = req.params.id;
  const targetUserId = targetIdParam === "me" || !targetIdParam ? authUser.id : Number(targetIdParam);

  if (Number.isNaN(targetUserId)) {
    res.status(400).json({ message: "Invalid user ID" });
    return;
  }

  const isAdmin = authUser.role.name === "ADMIN" || authUser.role.name === "SUPER_ADMIN";
  if (authUser.id !== targetUserId && !isAdmin) {
    res.status(403).json({ message: "Not authorized to update another user's profile picture" });
    return;
  }

  try {
    const { fileData, fileName } = req.body;
    if (!fileData) {
      res.status(400).json({ message: "Image data is required" });
      return;
    }

    const matches = fileData.match(/^data:(.+);base64,(.+)$/);
    const base64Data = matches ? matches[2] : fileData;
    const buffer = Buffer.from(base64Data, "base64");

    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = (fileName || "avatar.jpg").split(".").pop()?.toLowerCase() || "jpg";
    const uniqueFileName = `avatar_${targetUserId}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

    fs.writeFileSync(filePath, buffer);

    const publicApiUrl = process.env.PUBLIC_API_URL?.trim().replace(/\/+$/, "");
    const requestHost = req.get("host");
    const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const baseUrl = publicApiUrl || (requestHost ? `${forwardedProto}://${requestHost}` : null);
    if (!baseUrl) {
      res.status(500).json({ message: "Public API URL is not configured" });
      return;
    }
    const avatarUrl = `${baseUrl}/uploads/${uniqueFileName}`;

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { avatarUrl },
      include: {
        role: true,
        designation: true,
        employeeProfile: { include: { department: true } },
      },
    });

    emitUserUpdated({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      avatarUrl: updatedUser.avatarUrl,
      role: updatedUser.role.name,
      roleId: updatedUser.role.id,
      designation: updatedUser.designation?.name ?? null,
      employeeProfile: updatedUser.employeeProfile,
    });

    res.json({
      message: "Profile picture uploaded successfully",
      avatarUrl,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        avatarUrl: updatedUser.avatarUrl,
        role: updatedUser.role.name,
        roleId: updatedUser.role.id,
        designation: updatedUser.designation?.name ?? null,
        employeeProfile: updatedUser.employeeProfile,
      },
    });
  } catch (err: any) {
    console.error("Avatar upload error:", err);
    res.status(500).json({ message: "Failed to upload avatar", error: err.message });
  }
}

export async function deleteAvatar(req: Request, res: Response) {
  const authUser = await authenticate(req, res);
  if (!authUser) return;

  const targetIdParam = req.params.id;
  const targetUserId = targetIdParam === "me" || !targetIdParam ? authUser.id : Number(targetIdParam);

  if (Number.isNaN(targetUserId)) {
    res.status(400).json({ message: "Invalid user ID" });
    return;
  }

  const isAdmin = authUser.role.name === "ADMIN" || authUser.role.name === "SUPER_ADMIN";
  if (authUser.id !== targetUserId && !isAdmin) {
    res.status(403).json({ message: "Not authorized to remove another user's profile picture" });
    return;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { avatarUrl: null },
      include: {
        role: true,
        designation: true,
        employeeProfile: { include: { department: true } },
      },
    });

    emitUserUpdated({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      avatarUrl: null,
      role: updatedUser.role.name,
      roleId: updatedUser.role.id,
      designation: updatedUser.designation?.name ?? null,
      employeeProfile: updatedUser.employeeProfile,
    });

    res.json({
      message: "Profile picture removed successfully",
      avatarUrl: null,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        avatarUrl: null,
        role: updatedUser.role.name,
        roleId: updatedUser.role.id,
        designation: updatedUser.designation?.name ?? null,
        employeeProfile: updatedUser.employeeProfile,
      },
    });
  } catch (err: any) {
    console.error("Avatar delete error:", err);
    res.status(500).json({ message: "Failed to remove avatar", error: err.message });
  }
}
