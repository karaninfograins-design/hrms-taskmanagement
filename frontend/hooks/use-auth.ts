"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Session } from "@/types/auth";

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
if (typeof window !== "undefined") {
  try {
    memorySessionValue = window.localStorage.getItem(SESSION_KEY);
  } catch {
    memorySessionValue = null;
  }
}

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
  window.addEventListener(SESSION_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(SESSION_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

const getServerSnapshot = () => memorySessionValue;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => (typeof window !== "undefined");

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

  const isLoading = !session && !isHydrated;

  return { session, isLoading, saveSession, logout };
}
