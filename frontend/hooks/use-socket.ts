"use client";

import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket";

export function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;

    setSocket(s);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onPresence = (data: { onlineUsers: number[] }) => {
      setOnlineUserIds(data.onlineUsers || []);
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("presence:update", onPresence);

    if (s.connected) {
      setIsConnected(true);
    }

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("presence:update", onPresence);
    };
  }, []);

  return { socket, isConnected, onlineUserIds };
}
