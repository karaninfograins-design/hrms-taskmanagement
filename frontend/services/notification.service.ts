import { apiRequest, UnauthorizedError } from "./api";

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

let cachedNotifs: {
  token: string;
  data: GetNotificationsResponse;
  timestamp: number;
} | null = null;

let inflightNotifsPromise: Promise<GetNotificationsResponse> | null = null;

const NOTIFS_CACHE_TTL = 30 * 1000; // 30 seconds

export function invalidateNotificationCache() {
  cachedNotifs = null;
  inflightNotifsPromise = null;
}

/**
 * Fetches notifications. Uses a 30s cache to avoid redundant calls across page navigation.
 * Throws `UnauthorizedError` if the token is expired/invalid so the caller can stop polling.
 */
export async function getNotifications(token: string, forceRefresh = false): Promise<GetNotificationsResponse> {
  const now = Date.now();
  if (!forceRefresh && cachedNotifs && cachedNotifs.token === token && now - cachedNotifs.timestamp < NOTIFS_CACHE_TTL) {
    return cachedNotifs.data;
  }

  if (inflightNotifsPromise && !forceRefresh) {
    return inflightNotifsPromise;
  }

  inflightNotifsPromise = (async () => {
    try {
      const data = await apiRequest<GetNotificationsResponse>("/api/notifications", { token });
      cachedNotifs = { token, data, timestamp: Date.now() };
      return data;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Failed to fetch") || msg.includes("Network error") || msg.includes("connectivity")) {
        console.warn("[Notifications] Backend connectivity paused (will retry on next interval):", msg);
      } else {
        console.error("Failed to fetch notifications:", error);
      }
      return cachedNotifs?.data || { notifications: [], unreadCount: 0 };
    } finally {
      inflightNotifsPromise = null;
    }
  })();

  return inflightNotifsPromise;
}

export async function markNotificationAsRead(id: number, token: string): Promise<void> {
  invalidateNotificationCache();
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
  invalidateNotificationCache();
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
  invalidateNotificationCache();
  try {
    await apiRequest("/api/notifications/clear-all", {
      method: "DELETE",
      token,
    });
  } catch (error) {
    console.error("Failed to clear notifications:", error);
  }
}
