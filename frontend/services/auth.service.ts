import { apiRequest } from "@/services/api";
import type { LoginCredentials, Session } from "@/types/auth";

export function login(credentials: LoginCredentials) {
  return apiRequest<Session>("/api/auth/login", {
    method: "POST",
    body: credentials,
  });
}

let cachedMe: {
  token: string;
  data: { user: Session["user"] };
  timestamp: number;
} | null = null;

let inflightMePromise: Promise<{ user: Session["user"] }> | null = null;

const AUTH_ME_CACHE_TTL = 90 * 1000; // 90 seconds cache

export function invalidateAuthCache() {
  cachedMe = null;
  inflightMePromise = null;
}

export function getMe(token: string, forceRefresh = false): Promise<{ user: Session["user"] }> {
  const now = Date.now();
  if (!forceRefresh && cachedMe && cachedMe.token === token && now - cachedMe.timestamp < AUTH_ME_CACHE_TTL) {
    return Promise.resolve(cachedMe.data);
  }

  if (inflightMePromise && !forceRefresh) {
    return inflightMePromise;
  }

  inflightMePromise = apiRequest<{ user: Session["user"] }>("/api/auth/me", {
    token,
  })
    .then((data) => {
      cachedMe = { token, data, timestamp: Date.now() };
      inflightMePromise = null;
      return data;
    })
    .catch((err) => {
      inflightMePromise = null;
      throw err;
    });

  return inflightMePromise;
}

export function forgotPassword(email: string) {
  return apiRequest<{ message: string; email: string; fallback?: boolean }>("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export function verifyResetToken(token: string) {
  return apiRequest<{ valid: boolean; email?: string; name?: string; message?: string }>(
    `/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`,
    {
      method: "GET",
    }
  );
}

export function resetPassword(token: string, newPassword: string) {
  return apiRequest<{ message: string }>("/api/auth/reset-password", {
    method: "POST",
    body: { token, newPassword },
  });
}
