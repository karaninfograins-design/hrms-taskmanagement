import "dotenv/config";
import { prisma } from "../src/config/prisma.js";

async function removeLegacyUser(legacyEmail: string, targetEmail: string) {
  console.log(`\n========================================`);
  console.log(`Checking for legacy user: "${legacyEmail}"`);
  console.log(`Target active user: "${targetEmail}"`);
  console.log(`========================================`);

  const legacyUser = await prisma.user.findUnique({
    where: { email: legacyEmail },
    include: { role: true },
  });

  if (!legacyUser) {
    console.log(`✓ Legacy user "${legacyEmail}" does not exist in this database. Nothing to delete.`);
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { email: targetEmail },
  });

  if (!targetUser) {
    console.error(`✗ Error: Target user "${targetEmail}" not found. Cannot safely reassign assets.`);
    return;
  }

  console.log(`Found legacy user: ID ${legacyUser.id} (${legacyUser.name}, Role: ${legacyUser.role?.name})`);
  console.log(`Reassigning all assets to active user: ID ${targetUser.id} (${targetUser.name})...`);

  await prisma.$transaction(async (tx) => {
    // 1. Reassign Projects created by legacy user
    await tx.project.updateMany({
      where: { createdById: legacyUser.id },
      data: { createdById: targetUser.id },
    });

    // 2. Reassign Sprints
    await tx.sprint.updateMany({
      where: { createdById: legacyUser.id },
      data: { createdById: targetUser.id },
    });

    // 3. Reassign WorkItems (created, reported, assigned)
    await tx.workItem.updateMany({
      where: { createdById: legacyUser.id },
      data: { createdById: targetUser.id },
    });
    await tx.workItem.updateMany({
      where: { reporterId: legacyUser.id },
      data: { reporterId: targetUser.id },
    });
    await tx.workItem.updateMany({
      where: { assigneeId: legacyUser.id },
      data: { assigneeId: targetUser.id },
    });

    // 4. Reassign WorkItem assignees links
    await tx.workItemAssignee.deleteMany({
      where: { userId: legacyUser.id },
    });

    // 5. Reassign Comments
    await tx.comment.updateMany({
      where: { userId: legacyUser.id },
      data: { userId: targetUser.id },
    });
    await tx.comment.updateMany({
      where: { deletedById: legacyUser.id },
      data: { deletedById: targetUser.id },
    });

    // 6. Delete notifications and logs for legacy user
    await tx.notification.deleteMany({
      where: { userId: legacyUser.id },
    });
    await tx.workItemActivity.deleteMany({
      where: { userId: legacyUser.id },
    });

    // 7. Reassign or delete Meetings
    await tx.meeting.updateMany({
      where: { organizerId: legacyUser.id },
      data: { organizerId: targetUser.id },
    });
    await tx.meetingParticipant.deleteMany({
      where: { userId: legacyUser.id },
    });

    // 8. Messenger, Calls, and Group Summaries cleanup
    await tx.conversation.updateMany({
      where: { createdById: legacyUser.id },
      data: { createdById: targetUser.id },
    });
    await tx.message.updateMany({
      where: { senderId: legacyUser.id },
      data: { senderId: targetUser.id },
    });
    await tx.callSession.updateMany({
      where: { hostId: legacyUser.id },
      data: { hostId: targetUser.id },
    });
    await tx.conversationParticipant.deleteMany({
      where: { userId: legacyUser.id },
    });
    await tx.callParticipant.deleteMany({
      where: { userId: legacyUser.id },
    });
    await tx.groupDailySummary.deleteMany({
      where: { userId: legacyUser.id },
    });

    // 9. Attendance and Leave balances & approvals
    await tx.attendance.deleteMany({
      where: { userId: legacyUser.id },
    });
    await tx.leaveBalance.deleteMany({
      where: { userId: legacyUser.id },
    });
    await tx.leaveRequest.updateMany({
      where: { approvedById: legacyUser.id },
      data: { approvedById: targetUser.id },
    });
    await tx.leaveRequest.deleteMany({
      where: { userId: legacyUser.id },
    });

    // 10. Holidays and Reporting Manager hierarchy
    await tx.companyHoliday.updateMany({
      where: { createdById: legacyUser.id },
      data: { createdById: targetUser.id },
    });
    await tx.employeeProfile.updateMany({
      where: { reportingManagerId: legacyUser.id },
      data: { reportingManagerId: targetUser.id },
    });

    // 11. Project Member links
    await tx.projectMember.deleteMany({
      where: { userId: legacyUser.id },
    });

    // 12. Employee Profile
    await tx.employeeProfile.deleteMany({
      where: { userId: legacyUser.id },
    });

    // 13. Finally delete the User record
    await tx.user.delete({
      where: { id: legacyUser.id },
    });

    console.log(`✓ Successfully deleted legacy user "${legacyEmail}" (ID: ${legacyUser.id}) cleanly.`);
  });
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result: any[] = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '${tableName}' 
        AND COLUMN_NAME = '${columnName}'
      LIMIT 1;
    `);
    return Array.isArray(result) && result.length > 0;
  } catch (err) {
    return false;
  }
}

async function checkIndexExists(tableName: string, indexName: string): Promise<boolean> {
  try {
    const result: any[] = await prisma.$queryRawUnsafe(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '${tableName}' 
        AND INDEX_NAME = '${indexName}'
      LIMIT 1;
    `);
    return Array.isArray(result) && result.length > 0;
  } catch (err) {
    return false;
  }
}

async function ensureSchemaSynchronized() {
  console.log(`\n========================================`);
  console.log(`Checking & Auto-Migrating Production DB`);
  console.log(`========================================`);

  // 1. Check if User.avatarUrl exists before creating
  const avatarExists = await checkColumnExists("User", "avatarUrl");
  if (avatarExists) {
    console.log("✓ Column `User.avatarUrl` already exists. (Skipped creation)");
  } else {
    try {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `User` ADD COLUMN `avatarUrl` VARCHAR(500) NULL;"
      );
      console.log("✓ Applied migration: Added `User.avatarUrl` column.");
    } catch (err: any) {
      if (err?.message?.includes("Duplicate column name") || err?.message?.includes("1060")) {
        console.log("✓ Column `User.avatarUrl` already exists.");
      } else {
        console.warn("Notice adding `User.avatarUrl`:", err?.message || err);
      }
    }
  }

  // 2. Check if Notification.dedupeKey exists before creating
  const dedupeExists = await checkColumnExists("Notification", "dedupeKey");
  if (dedupeExists) {
    console.log("✓ Column `Notification.dedupeKey` already exists. (Skipped creation)");
  } else {
    try {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE `Notification` ADD COLUMN `dedupeKey` VARCHAR(191) NULL;"
      );
      console.log("✓ Applied migration: Added `Notification.dedupeKey` column.");
    } catch (err: any) {
      // Ignore if exists
    }
  }

  // Check unique index on Notification.dedupeKey
  const dedupeIndexExists = await checkIndexExists("Notification", "Notification_dedupeKey_key");
  if (!dedupeIndexExists) {
    try {
      await prisma.$executeRawUnsafe(
        "CREATE UNIQUE INDEX `Notification_dedupeKey_key` ON `Notification`(`dedupeKey`);"
      );
      console.log("✓ Applied migration: Created index `Notification_dedupeKey_key`.");
    } catch (err: any) {
      // Ignore if exists
    }
  }

  // 3. Ensure GroupDailySummary table exists (CREATE TABLE IF NOT EXISTS)
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`GroupDailySummary\` (
        \`id\` INTEGER NOT NULL AUTO_INCREMENT,
        \`conversationId\` INTEGER NOT NULL,
        \`userId\` INTEGER NOT NULL,
        \`date\` VARCHAR(10) NOT NULL,
        \`content\` TEXT NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        INDEX \`GroupDailySummary_conversationId_date_idx\`(\`conversationId\`, \`date\`),
        INDEX \`GroupDailySummary_createdAt_idx\`(\`createdAt\`),
        UNIQUE INDEX \`GroupDailySummary_conversationId_userId_date_key\`(\`conversationId\`, \`userId\`, \`date\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log("✓ Table `GroupDailySummary` verified (IF NOT EXISTS).");
  } catch (err: any) {
    // Ignore if exists
  }
}

async function main() {
  // Step 1: Ensure production DB schema is up-to-date before querying with Prisma
  await ensureSchemaSynchronized();

  // Step 2: Clean up legacy superadmin
  await removeLegacyUser("superadmin@hrms.com", "superadmin@infograins.com");

  // Step 3: Clean up legacy admin if exists
  await removeLegacyUser("admin@hrms.com", "admin@infograins.com");

  // Step 4: Automatically find and remove ANY extra duplicate superadmin users
  // Only superadmin@infograins.com should remain as Super Admin
  const allExtraSuperAdmins = await prisma.user.findMany({
    where: {
      role: { name: "SUPER_ADMIN" },
      email: { not: "superadmin@infograins.com" },
    },
  });

  for (const extraSuper of allExtraSuperAdmins) {
    console.log(`Found extra Super Admin: "${extraSuper.email}". Reassigning and removing...`);
    await removeLegacyUser(extraSuper.email, "superadmin@infograins.com");
  }

  // Step 5: Clean up legacy hr accounts (hr@infograins.com, hr@hrms.com, hr@company.com)
  // Reassign all their projects, sprints, work items, and chat messages to admin@infograins.com (or superadmin)
  const hrTargetUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: "admin@infograins.com" },
        { email: "superadmin@infograins.com" },
      ],
    },
  });
  if (hrTargetUser) {
    await removeLegacyUser("hr@infograins.com", hrTargetUser.email);
    await removeLegacyUser("hr@hrms.com", hrTargetUser.email);
    await removeLegacyUser("hr@company.com", hrTargetUser.email);
  }

  console.log("\nCleanup and schema migration finished successfully!\n");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
