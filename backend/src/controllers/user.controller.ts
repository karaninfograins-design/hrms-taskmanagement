import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { verifyToken } from "../utils/jwt.js";
import { hashPassword, comparePassword } from "../utils/password.js";

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

  const { name, email, phoneNumber, dob, gender, address, workLocation, employmentType, departmentId } = req.body as {
    name?: string;
    email?: string;
    phoneNumber?: string;
    dob?: string;
    gender?: string;
    address?: string;
    workLocation?: string;
    employmentType?: string;
    departmentId?: number;
  };

  try {
    const updateData: { name?: string; email?: string; phoneNumber?: string | null } = {};
    if (typeof name === "string" && name.trim()) updateData.name = name.trim();
    if (typeof phoneNumber === "string") updateData.phoneNumber = phoneNumber.trim() || null;
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

    // Sync EmployeeProfile
    await prisma.employeeProfile.upsert({
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
    });

    res.json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber ?? null,
        role: updatedUser.role.name,
        roleId: updatedUser.role.id,
        designation: updatedUser.designation?.name ?? null,
        employeeProfile: updatedUser.employeeProfile,
        permissions: updatedUser.role.permissions.map((rp: { permission: { name: string } }) => rp.permission.name),
      },
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
