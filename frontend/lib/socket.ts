import { io, Socket } from "socket.io-client";
import { getAuthToken } from "@/lib/auth";
import { getApiUrl } from "@/lib/api-config";

let socket: Socket | null = null;

export const getSocket = (): Socket | null => {
  if (typeof window === "undefined") return null;

  const token = getAuthToken();
  if (!token) return null;

  if (!socket) {
    socket = io(getApiUrl(), {
      auth: { token },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  } else if (!socket.connected) {
    socket.auth = { token };
    socket.connect();
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
