import "dotenv/config";
import process from "node:process";
import { prisma } from "../src/config/prisma.js";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Starting comprehensive HRMS database seed...");

  // 1. Seed Permissions (Both legacy colon-separated and standard UPPER_CASE for full compatibility)
  const permissionDefs = [
    // Resource-specific permissions
    { name: "employee:view", description: "View employee profiles and directory" },
    { name: "employee:create", description: "Create employee profiles" },
    { name: "employee:edit", description: "Edit employee profiles" },
    { name: "employee:delete", description: "Delete employee profiles" },
    { name: "admin:view", description: "View administrators" },
    { name: "admin:create", description: "Create administrators" },
    { name: "admin:edit", description: "Edit administrators" },
    { name: "admin:delete", description: "Delete administrators" },
    { name: "admin:role_manage", description: "Manage administrator roles" },
    { name: "project:view", description: "View workspace projects" },
    { name: "project:create", description: "Create workspace projects" },
    { name: "project:edit", description: "Edit workspace projects" },
    { name: "project:delete", description: "Delete workspace projects" },
    { name: "sprint:view", description: "View project sprints" },
    { name: "sprint:create", description: "Create project sprints" },
    { name: "sprint:edit", description: "Edit project sprints" },
    { name: "sprint:delete", description: "Delete project sprints" },
    { name: "work_item:view", description: "View work items (tasks, bugs, stories)" },
    { name: "work_item:create", description: "Create work items" },
    { name: "work_item:edit", description: "Edit work items" },
    { name: "work_item:delete", description: "Delete work items" },
    { name: "comment:view", description: "View work item comments" },
    { name: "comment:create", description: "Add work item comments" },
    { name: "comment:delete", description: "Delete work item comments" },

    // Role-action permissions
    { name: "MANAGE_USERS", description: "Create, read, update, and delete users" },
    { name: "MANAGE_EMPLOYEES", description: "Create, read, update, and delete employees" },
    { name: "MANAGE_ROLES", description: "Create, read, update, and delete roles" },
    { name: "MANAGE_PERMISSIONS", description: "Manage role permissions" },
    { name: "CREATE_PROJECTS", description: "Create new projects" },
    { name: "MANAGE_PROJECTS", description: "Manage all projects" },
    { name: "CREATE_SPRINTS", description: "Create new sprints" },
    { name: "MANAGE_SPRINTS", description: "Manage all sprints" },
    { name: "CREATE_WORK_ITEMS", description: "Create work items (epics, stories, tasks, bugs)" },
    { name: "MANAGE_WORK_ITEMS", description: "Manage all work items" },
    { name: "VIEW_WORK_ITEMS", description: "View work items" },
    { name: "ASSIGN_WORK", description: "Assign work items to users" },
    { name: "VIEW_REPORTS", description: "View system reports and analytics" },
    { name: "MANAGE_SETTINGS", description: "Manage company settings and criteria" },
    { name: "EMPLOYEE", description: "Base employee permission" },
  ];

  const permissions = await Promise.all(
    permissionDefs.map((p) =>
      prisma.permission.upsert({
        where: { name: p.name },
        create: { name: p.name, description: p.description },
        update: { description: p.description },
      })
    )
  );
  console.log(`Permissions seeded: ${permissions.length} total permissions.`);

  // 2. Seed Roles
  const superAdminRole = await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    create: { name: "SUPER_ADMIN", description: "System super administrator with full unrestricted access", status: true },
    update: { status: true },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: "ADMIN" },
    create: { name: "ADMIN", description: "Administrator with management and workspace permissions", status: true },
    update: { status: true },
  });

  const hrRole = await prisma.role.upsert({
    where: { name: "HR" },
    create: { name: "HR", description: "Human Resource Manager with people and leave management access", status: true },
    update: { status: true },
  });

  const employeeRole = await prisma.role.upsert({
    where: { name: "EMPLOYEE" },
    create: { name: "EMPLOYEE", description: "Regular employee with workspace and personal access", status: true },
    update: { status: true },
  });

  console.log("Roles seeded:", [superAdminRole.name, adminRole.name, hrRole.name, employeeRole.name]);

  // 3. Assign Permissions to Roles
  // SUPER_ADMIN gets ALL permissions
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({
      roleId: superAdminRole.id,
      permissionId: p.id,
    })),
    skipDuplicates: true,
  });

  // ADMIN permissions
  const adminPermissionNames = [
    "employee:view", "employee:create", "employee:edit",
    "admin:view", "admin:create",
    "project:view", "project:create", "project:edit", "project:delete",
    "sprint:view", "sprint:create", "sprint:edit", "sprint:delete",
    "work_item:view", "work_item:create", "work_item:edit", "work_item:delete",
    "comment:view", "comment:create", "comment:delete",
    "MANAGE_USERS", "MANAGE_EMPLOYEES", "CREATE_PROJECTS", "MANAGE_PROJECTS",
    "CREATE_SPRINTS", "MANAGE_SPRINTS", "CREATE_WORK_ITEMS", "MANAGE_WORK_ITEMS",
    "VIEW_WORK_ITEMS", "ASSIGN_WORK", "VIEW_REPORTS",
    "VIEW_PERMISSIONS", "MANAGE_PERMISSIONS",
  ];
  const adminPermObjs = permissions.filter((p) => adminPermissionNames.includes(p.name));
  await prisma.rolePermission.createMany({
    data: adminPermObjs.map((p) => ({
      roleId: adminRole.id,
      permissionId: p.id,
    })),
    skipDuplicates: true,
  });

  // HR permissions (HR has same permissions as Admin + MANAGE_SETTINGS and employee:delete)
  const hrPermissionNames = [
    ...adminPermissionNames,
    "employee:delete",
    "MANAGE_SETTINGS",
  ];
  const hrPermObjs = permissions.filter((p) => hrPermissionNames.includes(p.name));
  await prisma.rolePermission.createMany({
    data: hrPermObjs.map((p) => ({
      roleId: hrRole.id,
      permissionId: p.id,
    })),
    skipDuplicates: true,
  });

  // EMPLOYEE permissions
  const employeePermissionNames = [
    "project:view", "sprint:view", "work_item:view", "work_item:create", "work_item:edit",
    "comment:view", "comment:create", "VIEW_WORK_ITEMS", "CREATE_WORK_ITEMS", "EMPLOYEE",
  ];
  const employeePermObjs = permissions.filter((p) => employeePermissionNames.includes(p.name));
  await prisma.rolePermission.createMany({
    data: employeePermObjs.map((p) => ({
      roleId: employeeRole.id,
      permissionId: p.id,
    })),
    skipDuplicates: true,
  });

  console.log("Role permissions assigned successfully.");

  // 4. Seed Designations
  const designationDefs = [
    { name: "Software Engineer", description: "Develops frontend and backend software applications" },
    { name: "HR Manager", description: "Manages human resources, talent, and people operations" },
    { name: "Product Manager", description: "Manages product roadmap, iterations, and sprint backlogs" },
    { name: "DevOps Engineer", description: "Manages cloud infrastructure, CI/CD, and deployments" },
    { name: "QA Engineer", description: "Ensures software quality, automated testing, and reliability" },
    { name: "UI/UX Designer", description: "Designs user interfaces, experiences, and design systems" },
    { name: "CTO", description: "Chief Technology Officer" },
    { name: "Digital Marketing Executive", description: "Plans and executes digital marketing campaigns, SEO, and brand growth" },
    { name: "Business Development", description: "Drives business partnerships, client acquisition, and market expansion" },
  ];

  const designations = await Promise.all(
    designationDefs.map((d) =>
      prisma.designation.upsert({
        where: { name: d.name },
        create: { name: d.name, description: d.description, status: true },
        update: { description: d.description, status: true },
      })
    )
  );
  console.log("Designations seeded:", designations.map((d) => d.name));

  // 5. Seed Departments
  const departmentDefs = [
    { name: "Engineering", code: "ENG", description: "Software development, architecture, and IT" },
    { name: "Human Resources", code: "HR", description: "Talent acquisition, employee welfare, and operations" },
    { name: "Product & Design", code: "PROD", description: "Product discovery, specifications, and UI/UX" },
    { name: "Operations & DevOps", code: "OPS", description: "Infrastructure, security, and facility operations" },
  ];

  const departments = await Promise.all(
    departmentDefs.map((dept) =>
      prisma.department.upsert({
        where: { code: dept.code },
        create: { name: dept.name, code: dept.code, description: dept.description, status: true },
        update: { name: dept.name, description: dept.description, status: true },
      })
    )
  );
  console.log("Departments seeded:", departments.map((d) => d.name));

  // 6. Seed Leave Types
  const leaveTypeDefs = [
    { name: "Casual Leave", daysAllowed: 12, description: "Personal and casual time off" },
    { name: "Sick Leave", daysAllowed: 10, description: "Medical and health-related leave" },
    { name: "Earned Leave", daysAllowed: 12, description: "Annual accrued privilege leave" },
    { name: "Compensatory Off", daysAllowed: 12, description: "Overtime/weekend compensatory leave" },
    { name: "Unpaid Leave", daysAllowed: 30, description: "Leave without pay" },
  ];

  const leaveTypes = await Promise.all(
    leaveTypeDefs.map((lt) =>
      prisma.leaveType.upsert({
        where: { name: lt.name },
        create: { name: lt.name, daysAllowed: lt.daysAllowed, description: lt.description, status: true },
        update: { daysAllowed: lt.daysAllowed, description: lt.description, status: true },
      })
    )
  );
  console.log("Leave types seeded:", leaveTypes.map((lt) => lt.name));

  // 7. Seed HR Settings
  const hrSettingDefs = [
    { category: "SHIFT_TYPE", key: "SHIFT_TIMING", value: "10:30 - 8:00", isSystem: false },
    { category: "LEAVE_CRITERIA", key: "MONTHLY_PAID_LEAVE_DAYS", value: "1", isSystem: false },
    { category: "WORK_LOCATION", key: "FLEXI-HUB", value: "Flexi-hub", isSystem: false },
  ];

  for (const setting of hrSettingDefs) {
    await prisma.hRSetting.upsert({
      where: { category_key: { category: setting.category, key: setting.key } },
      create: setting,
      update: { value: setting.value, status: true },
    });
  }
  console.log("HR Settings seeded.");

  // 8. Seed Default Users (Super Admin, Admin, HR, Employee)
  const defaultPassword = process.env.DEFAULT_SEED_PASSWORD || "Securepassword";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const userDefs = [
    {
      name: "Super Admin",
      email: "superadmin@infograins.com",
      legacyEmails: ["superadmin@company.com", "superadmin@hrms.com"],
      roleId: superAdminRole.id,
      designationName: "CTO",
      deptCode: "ENG",
      employeeCode: "EMP-001",
    },
    {
      name: "Admin",
      email: "admin@infograins.com",
      legacyEmails: ["admin@hrms.com", "admin@company.com"],
      roleId: adminRole.id,
      designationName: "DevOps Engineer",
      deptCode: "OPS",
      employeeCode: "EMP-002",
    },
    {
      name: "HR Manager",
      email: "hr@infograins.com",
      legacyEmails: ["hr@hrms.com", "hr@company.com"],
      roleId: hrRole.id,
      designationName: "HR Manager",
      deptCode: "HR",
      employeeCode: "EMP-003",
    },
  ];

  // Check if core users exist before creating (safe for already deployed environments)
  const currentYear = new Date().getFullYear();

  for (const u of userDefs) {
    // Look up by current email, legacy emails, or employeeCode
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: u.email },
          { email: { in: u.legacyEmails } },
          { employeeProfile: { employeeCode: u.employeeCode } },
        ],
      },
      include: { employeeProfile: true },
    });

    if (existingUser) {
      console.log(`Core user ${u.name} already exists (ID: ${existingUser.id}, current email: ${existingUser.email}). Syncing email to "${u.email}", password, and role.`);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: u.name,
          email: u.email,
          passwordHash,
          status: "ACTIVE",
          roleId: u.roleId,
        },
      });

      if (existingUser.employeeProfile) {
        if (existingUser.employeeProfile.employeeCode !== u.employeeCode) {
          await prisma.employeeProfile.update({
            where: { id: existingUser.employeeProfile.id },
            data: { employeeCode: u.employeeCode },
          });
        }
      } else {
        const department = departments.find((dept) => dept.code === u.deptCode);
        await prisma.employeeProfile.create({
          data: {
            userId: existingUser.id,
            employeeCode: u.employeeCode,
            departmentId: department?.id || null,
            employmentType: "FULL_TIME",
            employmentStatus: "PERMANENT",
            workLocation: "OFFICE",
            dateOfJoining: new Date(),
          },
        });
      }
      continue;
    }

    const designation = designations.find((d) => d.name === u.designationName);
    const department = departments.find((dept) => dept.code === u.deptCode);

    const user = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        passwordHash,
        roleId: u.roleId,
        designationId: designation?.id || null,
        status: "ACTIVE",
      },
    });

    // Create EmployeeProfile
    await prisma.employeeProfile.create({
      data: {
        userId: user.id,
        employeeCode: u.employeeCode,
        departmentId: department?.id || null,
        employmentType: "FULL_TIME",
        employmentStatus: "PERMANENT",
        workLocation: "OFFICE",
        dateOfJoining: new Date(),
      },
    });

    // Initialize Leave Balances
    for (const lt of leaveTypes) {
      await prisma.leaveBalance.create({
        data: {
          userId: user.id,
          leaveTypeId: lt.id,
          year: currentYear,
          allocated: lt.daysAllowed,
          used: 0,
          remaining: lt.daysAllowed,
        },
      });
    }

    console.log(`Created core user ${u.name} (${u.email}).`);
  }

  console.log(`Seeded ${userDefs.length} core admin/HR users with profiles and leave balances.`);

  // 9. Seed additional employees (defined at the bottom of this file)
  await seedAdditionalEmployees(employeeRole.id, leaveTypes);

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

////////////////////////////////////////////////////////////////////////////////
// =============================================================================
//                       SECTION 2: EMPLOYEE SEED DATA
//        (All Employee Dataset & Seeding Functions Start Below This Line)
// =============================================================================
////////////////////////////////////////////////////////////////////////////////

export const additionalEmployees = [
  {
    name: "Parmanand Carpenter",
    email: "parmanandcarpenter@infograins.com",
    phoneNumber: "6262987989",
    password: "Password@123",
    designation: "Blockchain Developer",
    deptCode: "ENG",
    employeeCode: "EMP-004",
  },
  {
    name: "Karan pushpad",
    email: "Karanpushpad@infograins.com",
    phoneNumber: "7415186893",
    password: "Password@123",
    designation: "Python Developer",
    deptCode: "ENG",
    employeeCode: "EMP-005",
  },
  {
    name: "Rishabh Jaiswal",
    email: "rishabhjaiswal@infograins.com",
    phoneNumber: "9131641249",
    password: "Password@123",
    designation: "Blockchain Developer",
    deptCode: "ENG",
    employeeCode: "EMP-006",
  },
  {
    name: "Rohit Choudhary",
    email: "rohitchoudhary@infograins.com",
    phoneNumber: null,
    password: "Password@123",
    designation: "SR. Software Developer",
    deptCode: "ENG",
    employeeCode: "EMP-007",
  },
  {
    name: "Devendra Lowanshi",
    email: "devendralowanshi@infograins.com",
    phoneNumber: "6265475523",
    password: "Password@123",
    designation: "SR. Software Developer",
    deptCode: "ENG",
    employeeCode: "EMP-008",
  },
  {
    name: "Nirmal Patidar",
    email: "nirmalpatidar@infograins.com",
    phoneNumber: "8225971274",
    password: "Password@123",
    designation: "Project lead",
    deptCode: "ENG",
    employeeCode: "EMP-009",
  },
  {
    name: "Rajeev Asrani",
    email: "rajeevasrani@infograins.com",
    phoneNumber: "7748905335",
    password: "Password@123",
    designation: "Digital Marketing Executive",
    deptCode: "HR",
    employeeCode: "EMP-010",
  },
  {
    name: "Pranay Sharma",
    email: "pranaysharma@infograins.com",
    phoneNumber: null,
    password: "Password@123",
    designation: "Digital Marketing Executive",
    deptCode: "HR",
    employeeCode: "EMP-011",
  },
  {
    name: "Ankit patidar",
    email: "ankitpatidar@infograins.com",
    phoneNumber: "8878488052",
    password: "Password@123",
    designation: "Software Developer",
    deptCode: "ENG",
    employeeCode: "EMP-012",
  },
  {
    name: "Atul Mishra",
    email: "atulmishra@infograins.com",
    phoneNumber: "7898207125",
    password: "Password@123",
    designation: "Business Analyst",
    deptCode: "PROD",
    employeeCode: "EMP-013",
  },
  {
    name: "Adiraj shiwarkar",
    email: "Adirajshiwarkar@infograins.com",
    phoneNumber: null,
    password: "Password@123",
    designation: "AI-ML developer",
    deptCode: "ENG",
    employeeCode: "EMP-014",
  },
  {
    name: "Mohit sharma",
    email: "mohitsharma@infograins.com",
    phoneNumber: "7067053280",
    password: "Password@123",
    designation: "BA",
    deptCode: "ENG",
    employeeCode: "EMP-015",
  },
  {
    name: "shantaram dangi",
    email: "shantaramdangi@infograins.com",
    phoneNumber: "7877593063",
    password: "Password@123",
    designation: "UI UX",
    deptCode: "ENG",
    employeeCode: "EMP-016",
  },
  {
    name: "lavkush patel",
    email: "lavkushpatel@infograins.com",
    phoneNumber: "6265335014",
    password: "Password@123",
    designation: "Software developer",
    deptCode: "ENG",
    employeeCode: "EMP-017",
  },

];

export async function seedAdditionalEmployees(employeeRoleId: number, leaveTypes: any[]) {
  console.log(`Checking and seeding ${additionalEmployees.length} additional employees...`);
  const currentYear = new Date().getFullYear();

  for (const emp of additionalEmployees) {
    const normalizedEmail = emp.email.toLowerCase().trim();

    // Check if employee account is already available in the database (by email or employeeCode)
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { employeeProfile: { employeeCode: emp.employeeCode } },
        ],
      },
      include: { employeeProfile: true },
    });

    if (existingUser) {
      console.log(`Employee ${emp.name} already exists (ID: ${existingUser.id}, current email: ${existingUser.email}). Syncing details.`);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: emp.name,
          email: normalizedEmail,
          phoneNumber: emp.phoneNumber ? String(emp.phoneNumber) : (existingUser.phoneNumber || null),
          status: "ACTIVE",
        },
      });

      if (existingUser.employeeProfile) {
        if (existingUser.employeeProfile.employeeCode !== emp.employeeCode) {
          await prisma.employeeProfile.update({
            where: { id: existingUser.employeeProfile.id },
            data: { employeeCode: emp.employeeCode },
          });
        }
      } else {
        const department = await prisma.department.findUnique({
          where: { code: emp.deptCode },
        });
        await prisma.employeeProfile.create({
          data: {
            userId: existingUser.id,
            employeeCode: emp.employeeCode,
            departmentId: department?.id || null,
            employmentType: "FULL_TIME",
            employmentStatus: "PERMANENT",
            workLocation: "OFFICE",
            dateOfJoining: new Date(),
          },
        });
      }
      continue;
    }

    // 1. Ensure Designation exists
    const designation = await prisma.designation.upsert({
      where: { name: emp.designation },
      create: { name: emp.designation, status: true },
      update: { status: true },
    });

    // 2. Find Department
    const department = await prisma.department.findUnique({
      where: { code: emp.deptCode },
    });

    // 3. Hash Password
    const passwordHash = await bcrypt.hash(emp.password, 10);

    // 4. Create User
    const user = await prisma.user.create({
      data: {
        name: emp.name,
        email: normalizedEmail,
        phoneNumber: emp.phoneNumber ? String(emp.phoneNumber) : null,
        passwordHash,
        roleId: employeeRoleId,
        designationId: designation.id,
        status: "ACTIVE",
      },
    });

    // 5. Create EmployeeProfile
    await prisma.employeeProfile.create({
      data: {
        userId: user.id,
        employeeCode: emp.employeeCode,
        departmentId: department?.id || null,
        employmentType: "FULL_TIME",
        employmentStatus: "PERMANENT",
        workLocation: "OFFICE",
        dateOfJoining: new Date(),
      },
    });

    // 6. Initialize Leave Balances
    for (const lt of leaveTypes) {
      await prisma.leaveBalance.create({
        data: {
          userId: user.id,
          leaveTypeId: lt.id,
          year: currentYear,
          allocated: lt.daysAllowed,
          used: 0,
          remaining: lt.daysAllowed,
        },
      });
    }

    console.log(`Created employee ${emp.name} (${normalizedEmail}).`);
  }

  console.log(`Employee seed check completed.`);
}
