"use client";

import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(() => getSocket());
  const [isConnected, setIsConnected] = useState<boolean>(() => socket?.connected ?? false);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    setSocket(s);
    setIsConnected(s.connected);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onPresence = (data: { onlineUsers: number[] }) => {
      setOnlineUserIds(data.onlineUsers || []);
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("presence:update", onPresence);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("presence:update", onPresence);
    };
  }, []);

  return { socket, isConnected, onlineUserIds };
}
