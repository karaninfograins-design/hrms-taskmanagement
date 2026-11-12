"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Session } from "@/types/auth";
import { getMe } from "@/services/auth.service";
import { disconnectSocket, getSocket } from "@/lib/socket";
import { UnauthorizedError } from "@/services/api";

const SESSION_KEY = "hrms-session";
const SESSION_CHANGE_EVENT = "hrms-session-change";

function parseSession(savedSession: string | null): Session | null {
  if (!savedSession) return null;
  try {
    return JSON.parse(savedSession) as Session;
  } catch {
    return null;
  }
}

let memorySessionValue: string | null = null;

function readSessionValue() {
  if (typeof window === "undefined") return null;
  try {
    const val = window.localStorage.getItem(SESSION_KEY);
    memorySessionValue = val;
    return val;
  } catch {
    return memorySessionValue;
  }
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => { };
  window.addEventListener(SESSION_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(SESSION_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

const getServerSnapshot = () => null;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function useAuth() {
  const sessionValue = useSyncExternalStore(
    subscribe,
    readSessionValue,
    getServerSnapshot,
  );
  const session = useMemo(() => parseSession(sessionValue), [sessionValue]);
  const isHydrated = useSyncExternalStore(
    subscribe,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  const saveSession = useCallback((nextSession: Session) => {
    memorySessionValue = JSON.stringify(nextSession);
    window.localStorage.setItem(SESSION_KEY, memorySessionValue);
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  }, []);

  const logout = useCallback(() => {
    disconnectSocket();
    memorySessionValue = null;
    window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  }, []);

  // Synchronize live permissions and role from backend
  const userRoleKey = typeof session?.user?.role === "string" ? session.user.role : (session?.user?.role as any)?.name || "";

  // Real-time socket listener for profile/role updates
  useEffect(() => {
    if (!session?.token || !session?.user?.id) return;
    const socket = getSocket();
    if (!socket) return;

    const handleUserUpdated = (updatedUser: any) => {
      if (updatedUser?.id === session.user.id) {
        saveSession({
          ...session,
          user: {
            ...session.user,
            ...updatedUser,
            role: typeof updatedUser.role === "string" ? updatedUser.role : (updatedUser.role?.name || session.user.role),
            designation: typeof updatedUser.designation === "string" ? updatedUser.designation : (updatedUser.designation?.name || session.user.designation),
          },
        });
      }
    };

    socket.on("user:updated", handleUserUpdated);
    return () => {
      socket.off("user:updated", handleUserUpdated);
    };
  }, [session?.token, session?.user?.id, session?.user?.role, session?.user?.designation, saveSession]);

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    getMe(session.token)
      .then((res) => {
        if (!cancelled && res?.user) {
          const prevPerms = [...(session.user.permissions || [])].sort().join(",");
          const newPerms = [...(res.user.permissions || [])].sort().join(",");
          const currentRole = typeof session.user.role === "string" ? session.user.role : (session.user.role as any)?.name || "";
          const updatedRole = typeof res.user.role === "string" ? res.user.role : (res.user.role as any)?.name || "";
          const nameChanged = session.user.name !== res.user.name;
          const desigChanged = session.user.designation !== res.user.designation;
          const phoneChanged = (session.user.phoneNumber || "") !== (res.user.phoneNumber || "");
          const emailChanged = session.user.email !== res.user.email;
          const profileChanged = JSON.stringify((session.user as any).employeeProfile || null) !== JSON.stringify((res.user as any).employeeProfile || null);

          if (
            prevPerms !== newPerms ||
            currentRole !== updatedRole ||
            nameChanged ||
            desigChanged ||
            phoneChanged ||
            emailChanged ||
            profileChanged
          ) {
            saveSession({
              ...session,
              user: {
                ...session.user,
                ...res.user,
                role: updatedRole,
              },
            });
          }
        }
      })
      .catch((err: unknown) => {
        // If the stored token is expired/invalid, clear the session so user is sent to login
        if (!cancelled && err instanceof UnauthorizedError) {
          console.warn("[useAuth] Session token expired or invalid — logging out.");
          disconnectSocket();
          memorySessionValue = null;
          window.localStorage.removeItem(SESSION_KEY);
          window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [session?.token, userRoleKey, saveSession]);

  const isLoading = !session && !isHydrated;

  return { session, isLoading, saveSession, logout };
}
