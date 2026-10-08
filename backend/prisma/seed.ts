import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Password@123",
  database: process.env.DB_NAME || "hrms_db",
  connectionLimit: 5,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("Starting HRMS database seed...");

  // 1. Seed Permissions
  const permissions = await Promise.all([
    prisma.permission.upsert({
      where: { name: "MANAGE_USERS" },
      create: { name: "MANAGE_USERS", description: "Create, read, update, and delete users" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_EMPLOYEES" },
      create: { name: "MANAGE_EMPLOYEES", description: "Create, read, update, and delete employees" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_ROLES" },
      create: { name: "MANAGE_ROLES", description: "Create, read, update, and delete roles" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_PERMISSIONS" },
      create: { name: "MANAGE_PERMISSIONS", description: "Manage role permissions" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "CREATE_PROJECTS" },
      create: { name: "CREATE_PROJECTS", description: "Create new projects" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_PROJECTS" },
      create: { name: "MANAGE_PROJECTS", description: "Manage all projects" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "CREATE_SPRINTS" },
      create: { name: "CREATE_SPRINTS", description: "Create new sprints" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_SPRINTS" },
      create: { name: "MANAGE_SPRINTS", description: "Manage all sprints" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "CREATE_WORK_ITEMS" },
      create: { name: "CREATE_WORK_ITEMS", description: "Create work items (epics, stories, tasks, bugs)" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_WORK_ITEMS" },
      create: { name: "MANAGE_WORK_ITEMS", description: "Manage all work items" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "VIEW_WORK_ITEMS" },
      create: { name: "VIEW_WORK_ITEMS", description: "View work items" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "ASSIGN_WORK" },
      create: { name: "ASSIGN_WORK", description: "Assign work items to users" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "VIEW_REPORTS" },
      create: { name: "VIEW_REPORTS", description: "View system reports" },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_SETTINGS" },
      create: { name: "MANAGE_SETTINGS", description: "Manage system settings" },
      update: {},
    }),
  ]);

  console.log("Permissions seeded:", permissions.map((p) => p.name));

  // 2. Seed Roles
  const superAdminRole = await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    create: { name: "SUPER_ADMIN", description: "System super administrator with full access" },
    update: {},
  });

  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    create: { name: "ADMIN", description: "Administrator with management permissions" },
    update: {},
  });

  const hrRole = await prisma.role.upsert({
    where: { name: "HR" },
    create: { name: "HR", description: "Human Resource Manager" },
    update: {},
  });

  const employeeRole = await prisma.role.upsert({
    where: { name: "EMPLOYEE" },
    create: { name: "EMPLOYEE", description: "Regular employee with basic access" },
    update: {},
  });

  console.log("Roles seeded:", [superAdminRole.name, adminRole.name, hrRole.name, employeeRole.name]);

  // Assign permissions to Roles
  const allPermissionIds = permissions.map((p) => p.id);
  await prisma.rolePermission.createMany({
    data: allPermissionIds.map((permissionId) => ({
      roleId: superAdminRole.id,
      permissionId,
    })),
    skipDuplicates: true,
  });

  const adminPermissions = ["MANAGE_USERS", "MANAGE_EMPLOYEES", "CREATE_PROJECTS", "MANAGE_PROJECTS", "CREATE_SPRINTS", "MANAGE_SPRINTS", "CREATE_WORK_ITEMS", "MANAGE_WORK_ITEMS", "VIEW_WORK_ITEMS", "ASSIGN_WORK", "VIEW_REPORTS"];
  const adminPermissionObjects = permissions.filter((p) => adminPermissions.includes(p.name));
  await prisma.rolePermission.createMany({
    data: adminPermissionObjects.map((permission) => ({
      roleId: adminRole.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  const hrPermissions = ["MANAGE_EMPLOYEES", "VIEW_WORK_ITEMS", "VIEW_REPORTS"];
  const hrPermissionObjects = permissions.filter((p) => hrPermissions.includes(p.name));
  await prisma.rolePermission.createMany({
    data: hrPermissionObjects.map((permission) => ({
      roleId: hrRole.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  const employeePermissions = ["VIEW_WORK_ITEMS", "CREATE_WORK_ITEMS"];
  const employeePermissionObjects = permissions.filter((p) => employeePermissions.includes(p.name));
  await prisma.rolePermission.createMany({
    data: employeePermissionObjects.map((permission) => ({
      roleId: employeeRole.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  console.log("Role permissions assigned");

  // 3. Seed Designations
  const designations = await Promise.all([
    prisma.designation.upsert({
      where: { name: "Software Engineer" },
      create: { name: "Software Engineer", description: "Develops software applications", status: true },
      update: {},
    }),
    prisma.designation.upsert({
      where: { name: "HR Manager" },
      create: { name: "HR Manager", description: "Manages human resources", status: true },
      update: {},
    }),
    prisma.designation.upsert({
      where: { name: "Product Manager" },
      create: { name: "Product Manager", description: "Manages product development", status: true },
      update: {},
    }),
    prisma.designation.upsert({
      where: { name: "DevOps Engineer" },
      create: { name: "DevOps Engineer", description: "Manages deployment and infrastructure", status: true },
      update: {},
    }),
  ]);

  console.log("Designations seeded:", designations.map((d) => d.name));

  // 4. Seed Initial Core Users (SuperAdmin, HR, Admin)
  const defaultPasswordHash = await bcrypt.hash("Password@123", 10);

  const defaultUsers = [
    {
      name: "System Super Admin",
      email: "superadmin@hrms.com",
      passwordHash: defaultPasswordHash,
      roleId: superAdminRole.id,
      designationId: designations[0].id,
      status: "ACTIVE",
    },
    {
      name: "HR Manager",
      email: "hr@hrms.com",
      passwordHash: defaultPasswordHash,
      roleId: hrRole.id,
      designationId: designations[1].id,
      status: "ACTIVE",
    },
    {
      name: "System Admin",
      email: "admin@hrms.com",
      passwordHash: defaultPasswordHash,
      roleId: adminRole.id,
      designationId: designations[2].id,
      status: "ACTIVE",
    },
  ];

  for (const u of defaultUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: u,
      update: { passwordHash: u.passwordHash, status: "ACTIVE" },
    });
  }

  console.log("Default Users seeded:");
  console.log(" - SuperAdmin : superadmin@hrms.com / Password@123");
  console.log(" - HR Manager : hr@hrms.com        / Password@123");
  console.log(" - System Admin: admin@hrms.com     / Password@123");

  console.log("HRMS database seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
