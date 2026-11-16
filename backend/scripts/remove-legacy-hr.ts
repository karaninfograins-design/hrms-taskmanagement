import "dotenv/config";
import process from "node:process";
import { prisma } from "../src/config/prisma.js";

async function removeLegacyHr() {
  const emailsToRemove = ["hr@infograins.com", "hr@hrms.com", "hr@company.com"];

  console.log(`Checking for legacy HR accounts: ${emailsToRemove.join(", ")}...`);

  const legacyUsers = await prisma.user.findMany({
    where: { email: { in: emailsToRemove } },
  });

  if (legacyUsers.length === 0) {
    console.log("✓ No legacy HR users found in the database. Everything is clean!");
    return;
  }

  // Find fallback admin to reassign any owned entities
  const fallbackAdmin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: "superadmin@infograins.com" },
        { email: "admin@infograins.com" },
        { role: { name: "SUPER_ADMIN" } },
        { role: { name: "ADMIN" } },
      ],
      NOT: { email: { in: emailsToRemove } },
    },
  });

  for (const legacyUser of legacyUsers) {
    console.log(`Removing legacy HR user "${legacyUser.email}" (ID: ${legacyUser.id})...`);

    await prisma.$transaction(async (tx) => {
      const fallbackId = fallbackAdmin?.id;

      if (fallbackId) {
        await tx.project.updateMany({ where: { createdById: legacyUser.id }, data: { createdById: fallbackId } });
        await tx.sprint.updateMany({ where: { createdById: legacyUser.id }, data: { createdById: fallbackId } });
        await tx.workItem.updateMany({ where: { createdById: legacyUser.id }, data: { createdById: fallbackId } });
        await tx.workItem.updateMany({ where: { reporterId: legacyUser.id }, data: { reporterId: fallbackId } });
        await tx.workItem.updateMany({ where: { assigneeId: legacyUser.id }, data: { assigneeId: fallbackId } });
        await tx.comment.updateMany({ where: { userId: legacyUser.id }, data: { userId: fallbackId } });
        await tx.comment.updateMany({ where: { deletedById: legacyUser.id }, data: { deletedById: fallbackId } });
        await tx.meeting.updateMany({ where: { organizerId: legacyUser.id }, data: { organizerId: fallbackId } });
      }

      await tx.workItemAssignee.deleteMany({ where: { userId: legacyUser.id } });
      await tx.notification.deleteMany({ where: { userId: legacyUser.id } });
      await tx.workItemActivity.deleteMany({ where: { userId: legacyUser.id } });
      await tx.meetingParticipant.deleteMany({ where: { userId: legacyUser.id } });
      await tx.conversationParticipant.deleteMany({ where: { userId: legacyUser.id } });
      await tx.callParticipant.deleteMany({ where: { userId: legacyUser.id } });
      await tx.attendance.deleteMany({ where: { userId: legacyUser.id } });
      await tx.leaveBalance.deleteMany({ where: { userId: legacyUser.id } });
      await tx.leaveRequest.deleteMany({ where: { userId: legacyUser.id } });
      await tx.projectMember.deleteMany({ where: { userId: legacyUser.id } });
      await tx.employeeProfile.deleteMany({ where: { userId: legacyUser.id } });
      await tx.user.delete({ where: { id: legacyUser.id } });
    });

    console.log(`✓ Successfully deleted legacy HR user "${legacyUser.email}" (ID: ${legacyUser.id}).`);
  }
}

removeLegacyHr()
  .catch((err) => {
    console.error("Error removing legacy HR user:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

