import { getApiUrl } from "@/lib/api-config";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = getApiUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Network error. Please check backend connectivity.";
    throw new Error(errorMsg);
  }

  let data: Record<string, unknown> = {};
  try {
    const text = await response.text();
    if (text) {
      data = JSON.parse(text);
    }
  } catch {
    // Response body is not JSON or is empty
  }

  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}
