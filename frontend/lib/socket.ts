import { io, Socket } from "socket.io-client";
import { getAuthToken } from "@/lib/auth";
import { getApiUrl } from "@/lib/api-config";

let socket: Socket | null = null;
let currentToken: string | null = null;

export const getSocket = (): Socket | null => {
  if (typeof window === "undefined") return null;

  const token = getAuthToken();
  if (!token) {
    if (socket) {
      socket.disconnect();
      socket = null;
      currentToken = null;
    }
    return null;
  }

  // If the active token changed (e.g. login as different user or refreshed), recycle connection cleanly
  if (socket && currentToken && currentToken !== token) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }

  if (!socket) {
    currentToken = token;
    socket = io(getApiUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      upgrade: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      extraHeaders: {
        "ngrok-skip-browser-warning": "1",
      },
    });

    socket.on("connect_error", (err) => {
      console.warn("[Socket.IO] Connection error:", err.message);
      // If token expired or is invalid, stop thrashing the server with repeated failing handshakes
      if (
        err.message?.includes("Invalid authentication token") ||
        err.message?.includes("jwt expired") ||
        err.message?.includes("Authentication token required")
      ) {
        if (socket) {
          socket.disconnect();
        }
      }
    });
  } else if (!socket.connected && !socket.active) {
    // Only connect if the socket is completely disconnected and not actively trying to connect/handshake
    socket.auth = { token };
    socket.connect();
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentToken = null;
  }
};
