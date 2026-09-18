import { apiRequest } from "./api";
import type { User } from "@/types/auth";

export type UpdateProfileData = Partial<User> & {
  newPassword?: string;
  currentPassword?: string;
};

export type ProfileResponse = {
  user: User;
  message: string;
};

export async function updateProfile(
  userId: number | undefined,
  updateData: UpdateProfileData,
  token: string
): Promise<ProfileResponse> {
  const response = await apiRequest<ProfileResponse>(`/api/users/${userId || "me"}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updateData),
  });
  return response;
}

export async function changePassword(
  userId: number | undefined,
  currentPassword: string,
  newPassword: string,
  token: string
): Promise<ProfileResponse> {
  const response = await apiRequest<ProfileResponse>(`/api/users/${userId || "me"}/password`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return response;
}