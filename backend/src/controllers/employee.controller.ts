import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { hashPassword } from "../utils/password.js";
import { verifyToken } from "../utils/jwt.js";

// Types for Employee operations
type EmployeeInput = {
  name: string;
  email: string;
  password: string;
  phoneNumber?: string;
  roleId?: number;
  designationId?: number;
  status?: string;
};

type UpdateEmployeeInput = {
  name?: string;
  email?: string;
  password?: string;
  phoneNumber?: string;
  roleId?: number;
  designationId?: number;
  status?: string;
};

// Helper to check if user has permission to view employees
const canViewEmployees = async (userId: number): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  if (!user) return false;

  // SUPER_ADMIN and ADMIN can always view employees
  if (user.role.name === "SUPER_ADMIN" || user.role.name === "ADMIN") return true;

  // Check if role has any view/manage employee permission
  const hasViewPermission = user.role.permissions.some(
    (rp: { permission: { name: string } }) => {
      const pName = (rp.permission.name || "").toLowerCase();
      return (
        pName.includes("employee") ||
        pName.includes("manage_employees") ||
        pName.includes("view_employees")
      );
    }
  );

  return hasViewPermission;
};

// Helper to check if user has permission to manage (create/update/delete) employees
const canManageEmployees = async (userId: number): Promise<boolean> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  if (!user) return false;

  // SUPER_ADMIN can always manage employees
  if (user.role.name === "SUPER_ADMIN") return true;

  // Check if role has manage employees permission
  const hasManagePermission = user.role.permissions.some(
    (rp: { permission: { name: string } }) => {
      const pName = (rp.permission.name || "").toLowerCase();
      return (
        pName === "manage_employees" ||
        pName.includes("employee:create") ||
        pName.includes("employee:manage") ||
        pName.includes("employee:write")
      );
    }
  );

  return hasManagePermission || user.role.name === "ADMIN";
};

// Get all employees (with pagination)
export const getAllEmployees = async (
  req: Request,
  res: Response
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
    const canView = await canViewEmployees(userId);

    if (!canView) {
      res.status(403).json({
        message: "You do not have permission to view employees"
      });
      return;
    }

    const { page = 1, limit = 20, search, roleId, designationId, status } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: String(search) } },
        { email: { contains: String(search) } },
      ];
    }

    if (roleId) {
      where.roleId = Number(roleId);
    }

    if (designationId) {
      where.designationId = Number(designationId);
    }

    if (status) {
      if (status !== "ALL") {
        where.status = String(status);
      }
    } else {
      where.status = "ACTIVE";
    }

    const [employees, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          status: true,
          createdAt: true,
          role: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      employees,
      total,
      page: pageNum,
      pageSize: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Get employees error:", error);
    res.status(500).json({ message: "Failed to fetch employees" });
  }
};

// Get single employee by ID
export const getEmployeeById = async (
  req: Request,
  res: Response
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
    const canView = await canViewEmployees(userId);

    // EMPLOYEES can view their own profile or view employee details if they have view permission
    const requestedEmployeeId = Number(req.params.id);
    const isSelf = requestedEmployeeId === userId;

    if (!canView && !isSelf) {
      res.status(403).json({
        message: "You do not have permission to view this employee"
      });
      return;
    }

    const employee = await prisma.user.findUnique({
      where: { id: requestedEmployeeId },
      include: {
        role: true,
        designation: true,
        employeeProfile: {
          include: { department: true },
        },
        assignedWorkItems: {
          include: {
            project: { select: { id: true, name: true } },
          },
          take: 5,
        },
        createdProjects: { take: 5 },
      },
    });

    if (!employee) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }

    res.json({ employee });
  } catch (error) {
    console.error("Get employee error:", error);
    res.status(500).json({ message: "Failed to fetch employee" });
  }
};

// Create new employee
export const createEmployee = async (
  req: Request,
  res: Response
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
    const canManage = await canManageEmployees(userId);

    if (!canManage) {
      res.status(403).json({
        message: "You do not have permission to create employees"
      });
      return;
    }

    const {
      name,
      email,
      password,
      phoneNumber,
      roleId,
      designationId,
      status = "ACTIVE",
      dob,
      gender,
      address,
      dateOfJoining,
      employmentType = "FULL_TIME",
      employmentStatus = "PERMANENT",
      workLocation = "OFFICE",
      departmentId,
    } = req.body;

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

    // Check if employee role exists
    const employeeRole = await prisma.role.findUnique({
      where: { name: "EMPLOYEE" },
    });

    if (!employeeRole && !roleId) {
      res.status(400).json({
        message: "EMPLOYEE role not found and no roleId provided"
      });
      return;
    }

    // Use provided roleId or default to EMPLOYEE
    const finalRoleId = roleId || employeeRole?.id;

    // Check if user with email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (existingUser) {
      res.status(409).json({ message: "A user with this email already exists" });
      return;
    }

    const employee = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        passwordHash: await hashPassword(password),
        phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
        status: status as "ACTIVE" | "INACTIVE",
        roleId: finalRoleId,
        designationId: designationId || undefined,
        employeeProfile: {
          create: {
            employeeCode: `EMP-${Date.now().toString().slice(-6)}`,
            dob: dob ? new Date(dob) : null,
            gender: gender || null,
            address: address || null,
            dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
            employmentType: employmentType || "FULL_TIME",
            employmentStatus: employmentStatus || "PERMANENT",
            workLocation: workLocation || "OFFICE",
            departmentId: departmentId ? Number(departmentId) : null,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        status: true,
        role: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        employeeProfile: { include: { department: true } },
        createdAt: true,
      },
    });

    res.status(201).json({ message: "Employee created", employee });
  } catch (error) {
    console.error("Create employee error:", error);
    res.status(500).json({ message: "Failed to create employee" });
  }
};

// Update employee
export const updateEmployee = async (
  req: Request,
  res: Response
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
    const requestedEmployeeId = Number(req.params.id);

    // Check if user can manage employees or is updating self
    const canManage = await canManageEmployees(userId);
    const isSelf = requestedEmployeeId === userId;

    if (!canManage && !isSelf) {
      res.status(403).json({
        message: "You do not have permission to update this employee"
      });
      return;
    }

    const {
      name,
      email,
      password,
      phoneNumber,
      roleId,
      designationId,
      status,
      employeeCode,
      dob,
      gender,
      address,
      dateOfJoining,
      employmentType,
      employmentStatus,
      workLocation,
      departmentId,
    } = req.body;

    const userUpdateData: Record<string, unknown> = {};
    if (name) userUpdateData.name = name.trim();
    if (email) userUpdateData.email = email.trim().toLowerCase();
    if (phoneNumber !== undefined) userUpdateData.phoneNumber = phoneNumber ? phoneNumber.trim() : null;
    if (password) userUpdateData.passwordHash = await hashPassword(password);

    if (canManage) {
      if (roleId) userUpdateData.roleId = Number(roleId);
      if (designationId !== undefined) userUpdateData.designationId = designationId ? Number(designationId) : null;
      if (status) userUpdateData.status = status;
    }

    const employee = await prisma.user.update({
      where: { id: requestedEmployeeId },
      data: userUpdateData,
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        status: true,
        roleId: true,
        designationId: true,
        updatedAt: true,
        role: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
      },
    });

    // Upsert EmployeeProfile
    const profileFieldsProvided = [
      employeeCode,
      dob,
      gender,
      address,
      dateOfJoining,
      employmentType,
      employmentStatus,
      workLocation,
      departmentId,
    ].some((f) => f !== undefined);

    if (profileFieldsProvided || canManage || isSelf) {
      await prisma.employeeProfile.upsert({
        where: { userId: requestedEmployeeId },
        update: {
          ...(employeeCode && { employeeCode }),
          ...(dob && { dob: new Date(dob) }),
          ...(gender !== undefined && { gender }),
          ...(address !== undefined && { address }),
          ...(dateOfJoining && { dateOfJoining: new Date(dateOfJoining) }),
          ...(employmentType && { employmentType }),
          ...(employmentStatus && { employmentStatus }),
          ...(workLocation && { workLocation }),
          ...(departmentId !== undefined && { departmentId: departmentId ? Number(departmentId) : null }),
        },
        create: {
          userId: requestedEmployeeId,
          employeeCode: employeeCode || `EMP-${requestedEmployeeId}`,
          dob: dob ? new Date(dob) : null,
          gender: gender || null,
          address: address || null,
          dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
          employmentType: employmentType || "FULL_TIME",
          employmentStatus: employmentStatus || "PERMANENT",
          workLocation: workLocation || "OFFICE",
          departmentId: departmentId ? Number(departmentId) : null,
        },
      });
    }

    res.json({ message: "Employee updated", employee });
  } catch (error) {
    console.error("Update employee error:", error);
    res.status(500).json({ message: "Failed to update employee" });
  }
};

// Delete employee (soft delete - set status to INACTIVE)
export const deleteEmployee = async (
  req: Request,
  res: Response
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
    const requestedEmployeeId = Number(req.params.id);
    const canManage = await canManageEmployees(userId);

    // Users cannot delete themselves
    const isSelf = requestedEmployeeId === userId;

    if (!canManage || isSelf) {
      res.status(403).json({
        message: isSelf
          ? "You cannot delete your own account"
          : "You do not have permission to delete this employee"
      });
      return;
    }

    // Soft delete - set status to INACTIVE
    const employee = await prisma.user.update({
      where: { id: requestedEmployeeId },
      data: { status: "INACTIVE" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        updatedAt: true,
      },
    });

    res.json({ message: "Employee deactivated", employee });
  } catch (error) {
    console.error("Delete employee error:", error);
    res.status(500).json({ message: "Failed to delete employee" });
  }
};

// Get roles and designations for filters
export const getRolesAndDesignations = async (
  req: Request,
  res: Response
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
    const canView = await canViewEmployees(userId);

    if (!canView) {
      res.status(403).json({
        message: "You do not have permission to view roles and designations"
      });
      return;
    }

    const [roles, designations] = await Promise.all([
      prisma.role.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.designation.findMany({
        select: { id: true, name: true },
        where: { status: true },
        orderBy: { name: "asc" },
      }),
    ]);

    res.json({ roles, designations });
  } catch (error) {
    console.error("Get roles/designations error:", error);
    res.status(500).json({ message: "Failed to fetch roles and designations" });
  }
};
