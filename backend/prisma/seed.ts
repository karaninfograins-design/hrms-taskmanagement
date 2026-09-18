import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

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

  // Seed Permissions
  const permissions = await Promise.all([
    prisma.permission.upsert({
      where: { name: "MANAGE_USERS" },
      create: {
        name: "MANAGE_USERS",
        description: "Create, read, update, and delete users",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_EMPLOYEES" },
      create: {
        name: "MANAGE_EMPLOYEES",
        description: "Create, read, update, and delete employees",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_ROLES" },
      create: {
        name: "MANAGE_ROLES",
        description: "Create, read, update, and delete roles",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_PERMISSIONS" },
      create: {
        name: "MANAGE_PERMISSIONS",
        description: "Manage role permissions",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "CREATE_PROJECTS" },
      create: {
        name: "CREATE_PROJECTS",
        description: "Create new projects",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_PROJECTS" },
      create: {
        name: "MANAGE_PROJECTS",
        description: "Manage all projects",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "CREATE_SPRINTS" },
      create: {
        name: "CREATE_SPRINTS",
        description: "Create new sprints",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_SPRINTS" },
      create: {
        name: "MANAGE_SPRINTS",
        description: "Manage all sprints",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "CREATE_WORK_ITEMS" },
      create: {
        name: "CREATE_WORK_ITEMS",
        description: "Create work items (epics, stories, tasks, bugs)",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_WORK_ITEMS" },
      create: {
        name: "MANAGE_WORK_ITEMS",
        description: "Manage all work items",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "VIEW_WORK_ITEMS" },
      create: {
        name: "VIEW_WORK_ITEMS",
        description: "View work items",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "ASSIGN_WORK" },
      create: {
        name: "ASSIGN_WORK",
        description: "Assign work items to users",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "VIEW_REPORTS" },
      create: {
        name: "VIEW_REPORTS",
        description: "View system reports",
      },
      update: {},
    }),
    prisma.permission.upsert({
      where: { name: "MANAGE_SETTINGS" },
      create: {
        name: "MANAGE_SETTINGS",
        description: "Manage system settings",
      },
      update: {},
    }),
  ]);

  console.log("Permissions seeded:", permissions.map((p: { name: string }) => p.name));

  // Seed Roles
  const superAdminRole = await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    create: {
      name: "SUPER_ADMIN",
      description: "System super administrator with full access",
    },
    update: {},
  });

  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    create: {
      name: "ADMIN",
      description: "Administrator with limited access based on permissions",
    },
    update: {},
  });

  const employeeRole = await prisma.role.upsert({
    where: { name: "EMPLOYEE" },
    create: {
      name: "EMPLOYEE",
      description: "Regular employee with basic access",
    },
    update: {},
  });

  console.log("Roles seeded:", [superAdminRole.name, adminRole.name, employeeRole.name]);

  // Assign all permissions to SUPER_ADMIN
  const allPermissionIds = permissions.map((p: { id: number }) => p.id);
  await prisma.rolePermission.createMany({
    data: allPermissionIds.map((permissionId: number) => ({
      roleId: superAdminRole.id,
      permissionId,
    })),
    skipDuplicates: true,
  });

  // Assign common permissions to ADMIN
  const adminPermissions = [
    "MANAGE_EMPLOYEES",
    "CREATE_PROJECTS",
    "MANAGE_PROJECTS",
    "CREATE_SPRINTS",
    "MANAGE_SPRINTS",
    "CREATE_WORK_ITEMS",
    "MANAGE_WORK_ITEMS",
    "VIEW_WORK_ITEMS",
    "ASSIGN_WORK",
    "VIEW_REPORTS",
  ];

  const adminPermissionObjects = permissions.filter((p: { name: string }) =>
    adminPermissions.includes(p.name)
  );

  await prisma.rolePermission.createMany({
    data: adminPermissionObjects.map((permission: { id: number }) => ({
      roleId: adminRole.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  // Assign basic permissions to EMPLOYEE
  const employeePermissions = [
    "VIEW_WORK_ITEMS",
    "CREATE_WORK_ITEMS",
  ];

  const employeePermissionObjects = permissions.filter((p: { name: string }) =>
    employeePermissions.includes(p.name)
  );

  await prisma.rolePermission.createMany({
    data: employeePermissionObjects.map((permission: { id: number }) => ({
      roleId: employeeRole.id,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });

  console.log("Role permissions assigned");

  // Seed Designations
  const designations = await Promise.all([
    prisma.designation.upsert({
      where: { name: "Software Engineer" },
      create: {
        name: "Software Engineer",
        description: "Develops software applications",
        status: true,
      },
      update: {},
    }),
    prisma.designation.upsert({
      where: { name: "Product Manager" },
      create: {
        name: "Product Manager",
        description: "Manages product development",
        status: true,
      },
      update: {},
    }),
    prisma.designation.upsert({
      where: { name: "UI/UX Designer" },
      create: {
        name: "UI/UX Designer",
        description: "Designs user interfaces and experiences",
        status: true,
      },
      update: {},
    }),
    prisma.designation.upsert({
      where: { name: "QA Engineer" },
      create: {
        name: "QA Engineer",
        description: "Ensures software quality",
        status: true,
      },
      update: {},
    }),
    prisma.designation.upsert({
      where: { name: "DevOps Engineer" },
      create: {
        name: "DevOps Engineer",
        description: "Manages deployment and infrastructure",
        status: true,
      },
      update: {},
    }),
  ]);

  console.log("Designations seeded:", designations.map((d: { name: string }) => d.name));

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
