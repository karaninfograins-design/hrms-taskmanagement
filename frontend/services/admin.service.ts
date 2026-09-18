import { apiRequest } from "@/services/api";
import type { CreateAdminInput, CreatedAdmin } from "@/types/admin";

export function createAdmin(input: CreateAdminInput, token: string) {
  return apiRequest<{ message: string; admin: CreatedAdmin }>("/api/admins", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}
