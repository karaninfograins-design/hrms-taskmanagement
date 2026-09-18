import { apiRequest } from "@/services/api";
import type { LoginCredentials, Session } from "@/types/auth";

export function login(credentials: LoginCredentials) {
  return apiRequest<Session>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}
