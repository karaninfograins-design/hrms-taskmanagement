export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const sessionStr = localStorage.getItem("hrms-session");
    if (!sessionStr) return null;
    const session = JSON.parse(sessionStr);
    return session.token || null;
  } catch {
    return null;
  }
}
