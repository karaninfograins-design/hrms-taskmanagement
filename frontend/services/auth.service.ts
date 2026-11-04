import { apiRequest } from "@/services/api";
import type { LoginCredentials, Session } from "@/types/auth";

export function login(credentials: LoginCredentials) {
  return apiRequest<Session>("/api/auth/login", {
    method: "POST",
    body: credentials,
  });
}

export function getMe(token: string) {
  return apiRequest<{ user: Session["user"] }>("/api/auth/me", {
    token,
  });
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
