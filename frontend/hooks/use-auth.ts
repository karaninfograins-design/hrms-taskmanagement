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

function readSessionValue() {
  return window.localStorage.getItem(SESSION_KEY);
}

function subscribe(onStoreChange: () => void) {
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
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  }, []);

  return { session, isLoading: !isHydrated, saveSession, logout };
}
