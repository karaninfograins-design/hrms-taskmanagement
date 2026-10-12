import { apiRequest } from "./api";

export interface AppNotification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface GetNotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

export async function getNotifications(token: string): Promise<GetNotificationsResponse> {
  try {
    return await apiRequest<GetNotificationsResponse>("/api/notifications", { token });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return { notifications: [], unreadCount: 0 };
  }
}

export async function markNotificationAsRead(id: number, token: string): Promise<void> {
  try {
    await apiRequest(`/api/notifications/${id}/read`, {
      method: "PUT",
      token,
    });
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
  }
}

export async function markAllNotificationsAsRead(token: string): Promise<void> {
  try {
    await apiRequest("/api/notifications/read-all", {
      method: "PUT",
      token,
    });
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
  }
}

export async function clearAllNotifications(token: string): Promise<void> {
  try {
    await apiRequest("/api/notifications/clear-all", {
      method: "DELETE",
      token,
    });
  } catch (error) {
    console.error("Failed to clear notifications:", error);
  }
}
