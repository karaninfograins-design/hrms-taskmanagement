import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { emitNotificationUpdate } from "../socket.js";

export async function getNotifications(req: Request, res: Response) {
  const user = await authenticateUser(req, res);
  if (!user) return;

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, isRead: false },
  });

  res.json({ notifications, unreadCount });
}

export async function markNotificationAsRead(req: Request, res: Response) {
  const user = await authenticateUser(req, res);
  if (!user) return;

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid notification ID" });
    return;
  }

  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { isRead: true },
  });

  res.json({ message: "Notification marked as read" });
}

export async function markAllNotificationsAsRead(req: Request, res: Response) {
  const user = await authenticateUser(req, res);
  if (!user) return;

  await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });

  res.json({ message: "All notifications marked as read" });
}

export async function clearAllNotifications(req: Request, res: Response) {
  const user = await authenticateUser(req, res);
  if (!user) return;

  await prisma.notification.deleteMany({
    where: { userId: user.id },
  });

  res.json({ message: "All notifications cleared" });
}

export async function createNotificationsForUsers(
  userIds: number[],
  type: string,
  title: string,
  message: string,
  link?: string,
  dedupeKey?: string
) {
  if (!userIds || userIds.length === 0) return;

  const uniqueUserIds = Array.from(new Set(userIds));

  const result = await prisma.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      type,
      title,
      message,
      link: link || null,
      dedupeKey: dedupeKey ? `${dedupeKey}:${userId}` : null,
      isRead: false,
    })),
    skipDuplicates: Boolean(dedupeKey),
  });
  if (result.count > 0) emitNotificationUpdate(uniqueUserIds);
}

let checkingSprintDeadlines = false;

export async function notifyUpcomingSprintDeadlines() {
  if (checkingSprintDeadlines) return;
  checkingSprintDeadlines = true;

  try {
    const now = new Date();
    const reminderWindowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const sprints = await prisma.sprint.findMany({
      where: {
        status: { in: ["PLANNED", "ACTIVE"] },
        endDate: { gt: now, lte: reminderWindowEnd },
      },
      select: {
        id: true,
        name: true,
        endDate: true,
        projectId: true,
        project: { select: { name: true } },
        workItems: {
          select: {
            assigneeId: true,
            assignees: { select: { userId: true } },
          },
        },
      },
    });

    if (sprints.length === 0) return;

    const admins = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { name: { in: ["ADMIN", "SUPER_ADMIN"] } },
      },
      select: { id: true },
    });
    const adminIds = admins.map((admin) => admin.id);

    for (const sprint of sprints) {
      const projectMembers = await prisma.projectMember.findMany({
        where: { projectId: sprint.projectId },
        select: { userId: true },
      });
      const recipientIds = Array.from(new Set([
        ...adminIds,
        ...projectMembers.map((member) => member.userId),
        ...sprint.workItems.flatMap((item) => [
          ...(item.assigneeId ? [item.assigneeId] : []),
          ...item.assignees.map((assignee) => assignee.userId),
        ]),
      ]));

      await createNotificationsForUsers(
        recipientIds,
        "SPRINT_DEADLINE",
        "Sprint ending soon",
        `Sprint "${sprint.name}" in ${sprint.project.name} ends within 24 hours.`,
        `/dashboard/projects/${sprint.projectId}`,
        `sprint-deadline-${sprint.id}-${sprint.endDate.toISOString().slice(0, 10)}`
      );
    }
  } catch (error) {
    console.error("Sprint deadline notification job failed:", error);
  } finally {
    checkingSprintDeadlines = false;
  }
}
