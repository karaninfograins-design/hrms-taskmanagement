import { getApiUrl } from "@/lib/api-config";

export interface ApiOptions extends RequestInit {
  token?: string;
  body?: any;
}

export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const baseUrl = getApiUrl();
  const { token, body, headers: customHeaders, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(customHeaders as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let requestBody: string | undefined = undefined;
  if (body) {
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      headers,
      body: requestBody,
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
