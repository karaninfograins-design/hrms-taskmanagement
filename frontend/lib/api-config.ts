export const getApiUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    const isLocalAccess =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("172.");

    // If accessing locally/LAN, but env points to an external tunnel URL that might be dead/offline,
    // route directly to the local backend on the same host to prevent failed fetches
    if (isLocalAccess && envUrl && (envUrl.includes("ngrok") || envUrl.includes("loca.lt"))) {
      return `http://${host}:5000`;
    }

    if (!envUrl) {
      return `http://${host}:5000`;
    }
  }

  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  return "http://localhost:5000";
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
