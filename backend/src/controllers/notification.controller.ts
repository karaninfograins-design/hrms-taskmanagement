import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { authenticateUser } from "../middleware/auth.middleware.js";

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
  link?: string
) {
  if (!userIds || userIds.length === 0) return;

  const uniqueUserIds = Array.from(new Set(userIds));

  await prisma.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      type,
      title,
      message,
      link: link || null,
      isRead: false,
    })),
  });
}
