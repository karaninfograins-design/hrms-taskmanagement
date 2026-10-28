export const getApiUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL must be configured in the frontend environment");
  }

  return apiUrl.replace(/\/+$/, "");
};

export const buildApiUrl = (path: string): string => {
  return `${getApiUrl()}${path.startsWith("/") ? path : `/${path}`}`;
};

if (typeof window !== "undefined" && !(window as any).__ngrok_fetch_patched) {
  (window as any).__ngrok_fetch_patched = true;
  const originalFetch = window.fetch;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request)?.url || "";
    if (url.includes("ngrok") || url.includes("loca.lt")) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : {}));
      if (!headers.has("ngrok-skip-browser-warning")) {
        headers.set("ngrok-skip-browser-warning", "1");
      }
      if (!headers.has("Bypass-Tunnel-Reminder")) {
        headers.set("Bypass-Tunnel-Reminder", "1");
      }
      return originalFetch(input, { ...init, headers });
    }
    return originalFetch(input, init);
  };
}
