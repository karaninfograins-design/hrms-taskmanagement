export const getApiUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;

    // Local loopback access
    if (host === "localhost" || host === "127.0.0.1") {
      return `http://${host}:5000`;
    }

    // Local LAN access (e.g. 192.168.x.x, 10.x.x.x, 172.x.x.x)
    if (host.startsWith("192.168.") || host.startsWith("10.") || host.startsWith("172.")) {
      return `http://${host}:5000`;
    }

    // If accessing via tunnel but envUrl is tunnel, use envUrl
    if (envUrl && (envUrl.includes("ngrok") || envUrl.includes("loca.lt"))) {
      return envUrl.replace(/\/+$/, "");
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
