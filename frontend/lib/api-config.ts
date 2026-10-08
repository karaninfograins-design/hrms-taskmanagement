export const getApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window.location.hostname) {
    return `http://${window.location.hostname}:5000`;
  }
  return "http://localhost:5000";
};
