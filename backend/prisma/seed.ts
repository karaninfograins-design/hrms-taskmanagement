import "dotenv/config";
import process from "node:process";
import { prisma } from "../src/config/prisma.js";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Starting comprehensive HRMS database seed...");

  // 1. Seed Permissions (Both legacy colon-separated and standard UPPER_CASE for full compatibility)
  const permissionDefs = [
    // 1. Employee Directory & Profiles
    { name: "employee:view", description: "View employee profiles and directory" },
    { name: "employee:create", description: "Create employee profiles" },
    { name: "employee:edit", description: "Edit employee profiles" },
    { name: "employee:delete", description: "Delete employee profiles" },
    { name: "employee:approve", description: "Approve employee profile changes & promotions" },
    { name: "MANAGE_EMPLOYEES", description: "Full employee lifecycle management" },

    // 2. Projects & Workspaces
    { name: "project:view", description: "View workspace projects" },
    { name: "project:create", description: "Create workspace projects" },
    { name: "project:edit", description: "Edit workspace projects" },
    { name: "project:delete", description: "Delete workspace projects" },
    { name: "project:approve", description: "Approve project completions and milestones" },
    { name: "project:manage_members", description: "Assign and manage members in projects" },
    { name: "CREATE_PROJECTS", description: "Create new projects" },
    { name: "MANAGE_PROJECTS", description: "Manage all projects" },

    // 3. Sprints & Agile Iterations
    { name: "sprint:view", description: "View project sprints" },
    { name: "sprint:create", description: "Create project sprints" },
    { name: "sprint:edit", description: "Edit project sprints" },
    { name: "sprint:delete", description: "Delete project sprints" },
    { name: "sprint:approve", description: "Approve sprint releases and completions" },
    { name: "sprint:start_complete", description: "Start, activate and complete sprint iterations" },
    { name: "CREATE_SPRINTS", description: "Create new sprints" },
    { name: "MANAGE_SPRINTS", description: "Manage all sprints" },

    // 4. Epics & Strategic Roadmaps
    { name: "epic:view", description: "View epics, roadmaps and project milestones" },
    { name: "epic:create", description: "Create high-level epics and milestones" },
    { name: "epic:edit", description: "Edit epic descriptions, roadmaps and dates" },
    { name: "epic:delete", description: "Delete or archive epics" },
    { name: "MANAGE_EPICS", description: "Full management over epics and strategic roadmaps" },

    // 5. Tasks & Work Items
    { name: "work_item:view", description: "View work items (tasks, bugs, stories, subtasks)" },
    { name: "work_item:create", description: "Create work items" },
    { name: "work_item:edit", description: "Edit work items" },
    { name: "work_item:delete", description: "Delete work items" },
    { name: "work_item:approve", description: "Approve and close work items" },
    { name: "work_item:status_transition", description: "Transition task status across Kanban/Scrum columns" },
    { name: "CREATE_WORK_ITEMS", description: "Create work items" },
    { name: "MANAGE_WORK_ITEMS", description: "Manage all work items" },
    { name: "VIEW_WORK_ITEMS", description: "View work items" },
    { name: "ASSIGN_WORK", description: "Assign work items to users" },

    // 6. Project Backlog & Prioritization
    { name: "backlog:view", description: "View unassigned backlog items and grooming queues" },
    { name: "backlog:manage", description: "Prioritize backlog and move items between sprints" },

    // 5. Comments & Discussions
    { name: "comment:view", description: "View work item comments" },
    { name: "comment:create", description: "Add work item comments" },
    { name: "comment:edit", description: "Edit work item comments" },
    { name: "comment:delete", description: "Delete work item comments" },

    // 6. Leaves & Absence
    { name: "leave:view", description: "View leave requests and calendar" },
    { name: "leave:create", description: "Apply for leave requests" },
    { name: "leave:edit", description: "Edit leave applications" },
    { name: "leave:delete", description: "Cancel / delete leave applications" },
    { name: "leave:approve", description: "Approve or reject employee leave requests" },

    // 7. Attendance
    { name: "attendance:view", description: "View attendance logs and records" },
    { name: "attendance:create", description: "Clock-in / record attendance" },
    { name: "attendance:edit", description: "Regularize attendance logs" },
    { name: "attendance:approve", description: "Approve attendance regularization" },

    // 8. HR Policies & Settings
    { name: "settings:view", description: "View company settings and policies" },
    { name: "settings:edit", description: "Edit company criteria, shifts and policies" },
    { name: "MANAGE_SETTINGS", description: "Manage company settings and criteria" },

    // 9. Reports & Analytics
    { name: "report:view", description: "View system reports and analytics" },
    { name: "VIEW_REPORTS", description: "View system reports and analytics" },

    // 10. Role & User Governance
    { name: "admin:view", description: "View administrators" },
    { name: "admin:create", description: "Create administrators" },
    { name: "admin:edit", description: "Edit administrators" },
    { name: "admin:delete", description: "Delete administrators" },
    { name: "admin:role_manage", description: "Manage administrator roles" },
    { name: "MANAGE_USERS", description: "Create, read, update, and delete users" },
    { name: "MANAGE_ROLES", description: "Create, read, update, and delete roles" },
    { name: "MANAGE_PERMISSIONS", description: "Manage role permissions" },
    { name: "EMPLOYEE", description: "Base employee permission" },

    // 11. Main Workspace Dashboard
    { name: "dashboard:view", description: "View main workspace dashboard and analytics" },
    { name: "dashboard:edit", description: "Edit and customize dashboard metrics" },
  ];

  const permissions = [];
  for (const p of permissionDefs) {
    const perm = await prisma.permission.upsert({
      where: { name: p.name },
      create: { name: p.name, description: p.description },
      update: { description: p.description },
    });
    permissions.push(perm);
  }
  console.log(`Permissions seeded: ${permissions.length} total permissions.`);

  // 2. Seed Root Core Roles (Only SUPER_ADMIN and ADMIN are root system roles)
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

  const employeeRole = await prisma.role.upsert({
    where: { name: "EMPLOYEE" },
    create: { name: "EMPLOYEE", description: "Regular employee sub-role with workspace and personal access", status: true },
    update: { status: true },
  });

  // Preserve HR role as a sub-role if present, ensuring it has full operational permissions
  const hrRole = await prisma.role.findUnique({ where: { name: "HR" } });
  if (hrRole) {
    const hrPermNames = [
      "employee:view", "employee:create", "employee:edit", "employee:delete", "employee:approve", "MANAGE_EMPLOYEES",
      "leave:view", "leave:create", "leave:edit", "leave:delete", "leave:approve",
      "attendance:view", "attendance:create", "attendance:edit", "attendance:approve",
      "settings:view", "settings:edit", "MANAGE_SETTINGS",
      "report:view", "VIEW_REPORTS", "EMPLOYEE",
      "dashboard:view", "dashboard:edit",
      "project:view", "sprint:view", "work_item:view", "comment:view",
    ];
    const hrPermObjs = permissions.filter((p) => hrPermNames.includes(p.name));
    await prisma.rolePermission.createMany({
      data: hrPermObjs.map((p) => ({
        roleId: hrRole.id,
        permissionId: p.id,
      })),
      skipDuplicates: true,
    });
    console.log(`Preserved HR sub-role (ID: ${hrRole.id}) with ${hrPermObjs.length} permissions.`);
  }

  console.log("Core root roles seeded:", [superAdminRole.name, adminRole.name, employeeRole.name]);

  // 3. Assign Permissions to Core Roles
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
    "employee:view", "employee:create", "employee:edit", "employee:delete", "employee:approve",
    "admin:view", "admin:create", "admin:edit", "admin:delete", "admin:role_manage",
    "project:view", "project:create", "project:edit", "project:delete", "project:approve", "project:manage_members",
    "sprint:view", "sprint:create", "sprint:edit", "sprint:delete", "sprint:approve", "sprint:start_complete",
    "epic:view", "epic:create", "epic:edit", "epic:delete", "MANAGE_EPICS",
    "work_item:view", "work_item:create", "work_item:edit", "work_item:delete", "work_item:approve", "work_item:status_transition",
    "backlog:view", "backlog:manage",
    "comment:view", "comment:create", "comment:edit", "comment:delete",
    "leave:view", "leave:create", "leave:edit", "leave:delete", "leave:approve",
    "attendance:view", "attendance:create", "attendance:edit", "attendance:approve",
    "settings:view", "settings:edit", "report:view",
    "MANAGE_USERS", "MANAGE_EMPLOYEES", "CREATE_PROJECTS", "MANAGE_PROJECTS",
    "CREATE_SPRINTS", "MANAGE_SPRINTS", "CREATE_WORK_ITEMS", "MANAGE_WORK_ITEMS",
    "VIEW_WORK_ITEMS", "ASSIGN_WORK", "VIEW_REPORTS",
    "VIEW_PERMISSIONS", "MANAGE_PERMISSIONS", "MANAGE_ROLES", "MANAGE_SETTINGS",
    "dashboard:view", "dashboard:edit",
  ];
  const adminPermObjs = permissions.filter((p) => adminPermissionNames.includes(p.name));
  await prisma.rolePermission.createMany({
    data: adminPermObjs.map((p) => ({
      roleId: adminRole.id,
      permissionId: p.id,
    })),
    skipDuplicates: true,
  });

  // EMPLOYEE sub-role permissions
  const employeePermissionNames = [
    "project:view", "sprint:view", "epic:view", "work_item:view", "work_item:create", "work_item:edit", "work_item:status_transition",
    "backlog:view", "comment:view", "comment:create", "VIEW_WORK_ITEMS", "CREATE_WORK_ITEMS",
    "leave:view", "leave:create", "attendance:view", "attendance:create",
    "EMPLOYEE",
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

  // Enforce strictly ONE unique Super Admin (superadmin@infograins.com) and clean up duplicates
  const targetSuperAdmin = await prisma.user.findUnique({
    where: { email: "superadmin@infograins.com" },
  });
  const targetAdmin = await prisma.user.findUnique({
    where: { email: "admin@infograins.com" },
  });

  if (targetSuperAdmin) {
    const duplicateSuperAdmins = await prisma.user.findMany({
      where: {
        OR: [
          { roleId: superAdminRole.id, NOT: { id: targetSuperAdmin.id } },
          { email: { in: ["superadmin@hrms.com", "superadmin@company.com"] }, NOT: { id: targetSuperAdmin.id } },
        ],
      },
    });

    for (const dup of duplicateSuperAdmins) {
      console.log(`Reassigning and removing duplicate superadmin ${dup.email} (ID: ${dup.id})...`);
      await prisma.$transaction(async (tx) => {
        await tx.project.updateMany({ where: { createdById: dup.id }, data: { createdById: targetSuperAdmin.id } });
        await tx.sprint.updateMany({ where: { createdById: dup.id }, data: { createdById: targetSuperAdmin.id } });
        await tx.workItem.updateMany({ where: { createdById: dup.id }, data: { createdById: targetSuperAdmin.id } });
        await tx.workItem.updateMany({ where: { reporterId: dup.id }, data: { reporterId: targetSuperAdmin.id } });
        await tx.workItem.updateMany({ where: { assigneeId: dup.id }, data: { assigneeId: targetSuperAdmin.id } });
        await tx.workItemAssignee.deleteMany({ where: { userId: dup.id } });
        await tx.comment.updateMany({ where: { userId: dup.id }, data: { userId: targetSuperAdmin.id } });
        await tx.comment.updateMany({ where: { deletedById: dup.id }, data: { deletedById: targetSuperAdmin.id } });
        await tx.notification.deleteMany({ where: { userId: dup.id } });
        await tx.workItemActivity.deleteMany({ where: { userId: dup.id } });
        await tx.meeting.updateMany({ where: { organizerId: dup.id }, data: { organizerId: targetSuperAdmin.id } });
        await tx.meetingParticipant.deleteMany({ where: { userId: dup.id } });
        await tx.conversation.updateMany({ where: { createdById: dup.id }, data: { createdById: targetSuperAdmin.id } });
        await tx.message.updateMany({ where: { senderId: dup.id }, data: { senderId: targetSuperAdmin.id } });
        await tx.callSession.updateMany({ where: { hostId: dup.id }, data: { hostId: targetSuperAdmin.id } });
        await tx.conversationParticipant.deleteMany({ where: { userId: dup.id } });
        await tx.callParticipant.deleteMany({ where: { userId: dup.id } });
        await tx.groupDailySummary.deleteMany({ where: { userId: dup.id } });
        await tx.attendance.deleteMany({ where: { userId: dup.id } });
        await tx.leaveBalance.deleteMany({ where: { userId: dup.id } });
        await tx.leaveRequest.updateMany({ where: { approvedById: dup.id }, data: { approvedById: targetSuperAdmin.id } });
        await tx.leaveRequest.deleteMany({ where: { userId: dup.id } });
        await tx.companyHoliday.updateMany({ where: { createdById: dup.id }, data: { createdById: targetSuperAdmin.id } });
        await tx.employeeProfile.updateMany({ where: { reportingManagerId: dup.id }, data: { reportingManagerId: targetSuperAdmin.id } });
        await tx.projectMember.deleteMany({ where: { userId: dup.id } });
        await tx.employeeProfile.deleteMany({ where: { userId: dup.id } });
        await tx.user.delete({ where: { id: dup.id } });
      });
      console.log(`✓ Deleted duplicate superadmin ${dup.email}.`);
    }
  }

  // Clean up legacy admin/hr accounts if still present in database
  if (targetAdmin) {
    const legacyAdmins = await prisma.user.findMany({
      where: {
        email: { in: ["admin@hrms.com", "admin@company.com", "hr@hrms.com", "hr@company.com", "hr@infograins.com"] },
        NOT: { id: targetAdmin.id },
      },
    });

    for (const leg of legacyAdmins) {
      console.log(`Cleaning legacy account ${leg.email} (ID: ${leg.id})...`);
      await prisma.$transaction(async (tx) => {
        await tx.project.updateMany({ where: { createdById: leg.id }, data: { createdById: targetAdmin.id } });
        await tx.sprint.updateMany({ where: { createdById: leg.id }, data: { createdById: targetAdmin.id } });
        await tx.workItem.updateMany({ where: { createdById: leg.id }, data: { createdById: targetAdmin.id } });
        await tx.workItem.updateMany({ where: { reporterId: leg.id }, data: { reporterId: targetAdmin.id } });
        await tx.workItem.updateMany({ where: { assigneeId: leg.id }, data: { assigneeId: targetAdmin.id } });
        await tx.workItemAssignee.deleteMany({ where: { userId: leg.id } });
        await tx.comment.updateMany({ where: { userId: leg.id }, data: { userId: targetAdmin.id } });
        await tx.notification.deleteMany({ where: { userId: leg.id } });
        await tx.workItemActivity.deleteMany({ where: { userId: leg.id } });
        await tx.meeting.updateMany({ where: { organizerId: leg.id }, data: { organizerId: targetAdmin.id } });
        await tx.meetingParticipant.deleteMany({ where: { userId: leg.id } });
        await tx.conversation.updateMany({ where: { createdById: leg.id }, data: { createdById: targetAdmin.id } });
        await tx.message.updateMany({ where: { senderId: leg.id }, data: { senderId: targetAdmin.id } });
        await tx.callSession.updateMany({ where: { hostId: leg.id }, data: { hostId: targetAdmin.id } });
        await tx.conversationParticipant.deleteMany({ where: { userId: leg.id } });
        await tx.callParticipant.deleteMany({ where: { userId: leg.id } });
        await tx.groupDailySummary.deleteMany({ where: { userId: leg.id } });
        await tx.attendance.deleteMany({ where: { userId: leg.id } });
        await tx.leaveBalance.deleteMany({ where: { userId: leg.id } });
        await tx.leaveRequest.updateMany({ where: { approvedById: leg.id }, data: { approvedById: targetAdmin.id } });
        await tx.leaveRequest.deleteMany({ where: { userId: leg.id } });
        await tx.companyHoliday.updateMany({ where: { createdById: leg.id }, data: { createdById: targetAdmin.id } });
        await tx.employeeProfile.updateMany({ where: { reportingManagerId: leg.id }, data: { reportingManagerId: targetAdmin.id } });
        await tx.projectMember.deleteMany({ where: { userId: leg.id } });
        await tx.employeeProfile.deleteMany({ where: { userId: leg.id } });
        await tx.user.delete({ where: { id: leg.id } });
      });
      console.log(`✓ Cleaned legacy account ${leg.email}.`);
    }
  }

  console.log(`Seeded core root users: 1 unique Super Admin (${userDefs[0]?.email || "superadmin@infograins.com"}) and 1 Admin (${userDefs[1]?.email || "admin@infograins.com"}).`);

  // 9. Seed additional employees under standard EMPLOYEE sub-role
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

// ***********************************************************************************************************
//                       SECTION 2: EMPLOYEE SEED DATA
//        (All Employee Dataset & Seeding Functions Start Below This Line)
// ***********************************************************************************************************

export const additionalEmployees = [
  {
    name: "Payal Porwal",
    email: "PayalPorwal@infograins.com",
    phoneNumber: "",
    password: "Password@123",
    designation: "HR Manager",
    deptCode: "Hr",
    employeeCode: "EMP-003",
  },
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
  {
    name: "Dheeraj gami",
    email: "Dheerajgami@infograins.com",
    phoneNumber: "",
    password: "Password@123",
    designation: "Software developer",
    deptCode: "ENG",
    employeeCode: "EMP-018",
  },
  {
    name: "Saina jaiswal",
    email: "Sainajaiswal@infograins.com",
    phoneNumber: "9131268958",
    password: "Password@123",
    designation: "HR Manager",
    deptCode: "Hr",
    employeeCode: "EMP-019",
  },
  {
    name: "Mahi Rajput",
    email: "mahirajput@infograins.com",
    phoneNumber: "",
    password: "Password@123",
    designation: "BDE",
    deptCode: "SALES",
    employeeCode: "EMP-020",
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
