import { apiRequest } from "@/services/api";
import type { LoginCredentials, Session } from "@/types/auth";

export function login(credentials: LoginCredentials) {
  return apiRequest<Session>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export function getMe(token: string) {
  return apiRequest<{ user: Session["user"] }>("/api/auth/me", {
    token,
  });
}
