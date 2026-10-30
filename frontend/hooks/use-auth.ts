"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Session } from "@/types/auth";
import { getMe } from "@/services/auth.service";

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
    memorySessionValue = null;
    window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  }, []);

  // Synchronize live permissions and role from backend
  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    getMe(session.token)
      .then((res) => {
        if (!cancelled && res?.user) {
          const prevPerms = session.user.permissions?.join(",") || "";
          const newPerms = res.user.permissions?.join(",") || "";
          if (prevPerms !== newPerms || session.user.role !== res.user.role) {
            saveSession({
              ...session,
              user: res.user,
            });
          }
        }
      })
      .catch(() => { });

    return () => {
      cancelled = true;
    };
  }, [session?.token, session?.user?.role, saveSession]);

  const isLoading = !session && !isHydrated;

  return { session, isLoading, saveSession, logout };
}
