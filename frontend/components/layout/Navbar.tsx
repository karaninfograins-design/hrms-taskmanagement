"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CompanyLogo } from "@/components/common/company-logo";
import type { User } from "@/types/auth";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
  type AppNotification,
} from "@/services/notification.service";

type NavbarProps = {
  user: User;
  onSignOut?: () => void;
};

export function Navbar({ user, onSignOut }: NavbarProps) {
  const router = useRouter();
  const { session } = useAuth();
  const { socket } = useSocket();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    if (!session?.token) return;
    setLoadingNotifs(true);
    const res = await getNotifications(session.token);
    setNotifications(res.notifications || []);
    setUnreadCount(res.unreadCount || 0);
    setLoadingNotifs(false);
  }, [session?.token]);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 20000); // Polling every 20 seconds
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  useEffect(() => {
    if (!socket) return;
    const onNotificationCreated = () => {
      void fetchNotifs();
    };
    const onIncomingCall = (call: {
      callSessionId: number;
      channelName: string;
      caller: { id: number; name: string };
      type: "AUDIO" | "VIDEO";
      conversationName?: string | null;
      isGroupCall?: boolean;
    }) => {
      if (window.location.pathname.startsWith("/dashboard/messenger/calls")) return;
      const params = new URLSearchParams({
        incomingCall: "true",
        callSessionId: String(call.callSessionId),
        activeChannel: call.channelName,
        callerId: String(call.caller.id),
        callerName: call.caller.name,
        type: call.type,
        ...(call.conversationName ? { groupName: call.conversationName } : {}),
        ...(call.isGroupCall ? { groupCall: "true" } : {}),
      });
      router.push(`/dashboard/messenger/calls?${params.toString()}`);
    };

    socket.on("notification:new", onNotificationCreated);
    socket.on("incoming:call", onIncomingCall);
    return () => {
      socket.off("notification:new", onNotificationCreated);
      socket.off("incoming:call", onIncomingCall);
    };
  }, [fetchNotifs, router, socket]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.isRead && session?.token) {
      await markNotificationAsRead(notif.id, session.token);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    if (notif.link) {
      setIsNotifOpen(false);
      router.push(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    if (!session?.token) return;
    await markAllNotificationsAsRead(session.token);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleClearAll = async () => {
    if (!session?.token) return;
    await clearAllNotifications(session.token);
    setNotifications([]);
    setUnreadCount(0);
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "EMPLOYEE_CREATED":
        return "";
      case "PROJECT_CREATED":
        return "";
      case "WORK_ITEM":
        return "";
      case "LEAVE":
        return "";
      default:
        return "";
    }
  };

  return (
    <header className="topbar">
      <Link className="brand" href="/dashboard" aria-label="Infograins HRMS dashboard">
        <CompanyLogo />
      </Link>

      <div className="flex items-center gap-4">
        {/* Notification Bell Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setIsNotifOpen(!isNotifOpen);
              setIsProfileOpen(false);
            }}
            className="relative p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
            style={{ border: "none", background: "none", cursor: "pointer" }}
            aria-label="Notifications"
          >
            <span style={{ fontSize: "1.25rem" }}>🔔</span>
            {unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border-2 border-white animate-pulse"
                style={{
                  backgroundColor: "#ef4444",
                  color: "#ffffff",
                  fontSize: "10px",
                  fontWeight: "bold",
                  borderRadius: "9999px",
                  height: "20px",
                  width: "20px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1,
                }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div
              className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-2xl shadow-xl border border-gray-200 z-[1000] overflow-hidden flex flex-col"
              style={{
                position: "absolute",
                right: 0,
                marginTop: "8px",
                width: "360px",
                maxHeight: "480px",
                backgroundColor: "#ffffff",
                borderRadius: "16px",
                boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
                border: "1px solid var(--line, #e2e8f0)",
                zIndex: 1000,
              }}
            >
              {/* Notification Header */}
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>Notifications</strong>
                  {unreadCount > 0 && (
                    <span
                      style={{
                        backgroundColor: "#3b82f6",
                        color: "#fff",
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {unreadCount} new
                    </span>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#f97316",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {/* Notification Body */}
              <div
                style={{
                  maxHeight: "320px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {loadingNotifs && notifications.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "#64748b", fontSize: "0.85rem" }}>
                    Loading notifications...
                  </div>
                ) : notifications.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: "#64748b" }}>
                    <small style={{ fontSize: "0.78rem", color: "#94a3b8" }}>No notifications at this moment.</small>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #f1f5f9",
                        backgroundColor: notif.isRead ? "#ffffff" : "#fff7ed",
                        cursor: "pointer",
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-start",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = notif.isRead ? "#f8fafc" : "#ffedd5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = notif.isRead ? "#ffffff" : "#fff7ed";
                      }}
                    >
                      <span
                        style={{
                          fontSize: "1.2rem",
                          backgroundColor: notif.isRead ? "#f1f5f9" : "#ffedd5",
                          padding: "6px",
                          borderRadius: "10px",
                          lineHeight: 1,
                        }}
                      >
                        {getNotifIcon(notif.type)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                          <strong style={{ fontSize: "0.85rem", color: "#0f172a", fontWeight: 700 }}>
                            {notif.title}
                          </strong>
                          <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                            {formatTimeAgo(notif.createdAt)}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#475569", lineHeight: 1.4 }}>
                          {notif.message}
                        </p>
                      </div>
                      {!notif.isRead && (
                        <span
                          style={{
                            height: "8px",
                            width: "8px",
                            borderRadius: "50%",
                            backgroundColor: "#f97316",
                            marginTop: "6px",
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Notification Footer with Clear All */}
              {notifications.length > 0 && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderTop: "1px solid #f1f5f9",
                    backgroundColor: "#f8fafc",
                    textAlign: "center",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleClearAll}
                    style={{
                      width: "100%",
                      padding: "8px",
                      backgroundColor: "#fee2e2",
                      color: "#dc2626",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "background-color 0.2s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#fca5a5")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#fee2e2")}
                  >
                    Clear All Notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          {/* Trigger Button */}
          <button
            type="button"
            onClick={() => {
              setIsProfileOpen(!isProfileOpen);
              setIsNotifOpen(false);
            }}
            aria-expanded={isProfileOpen}
            aria-haspopup="true"
            className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-gray-100/80 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-900 to-gray-700 text-white font-medium text-xs flex items-center justify-center shadow-inner">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-gray-700 hidden sm:inline-block">
              {user.name}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isProfileOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-50 origin-top-right rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl ring-1 ring-black/5 focus:outline-none z-[1000] p-1.5 animate-in fade-in zoom-in-95 duration-100"
            >
            {/* User Info Header */}
              <div className="px-3 py-2.5 mb-1 rounded-xl bg-gray-50/80 border border-gray-100">
                <p className="text-[8px] font-semibold text-gray-400 uppercase tracking-wider">Signed in as</p>
                <p className="text-xs font-semibold text-gray-900 truncate mt-0.5">{user.email || user.name}</p>
              </div>

            {/* Menu Options */}
              <div className="space-y-0.5 mt-2">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push("/dashboard/profile");
                    setIsProfileOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-gray-700 rounded-xl hover:bg-gray-100/80 hover:text-gray-900 transition-all group"
                >
                  <div className="p-1 rounded-lg bg-gray-100 text-gray-500 group-hover:bg-white group-hover:shadow-sm transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  My Profile
                </button>
              </div>

              <div className="my-1 border-t border-gray-100" />

              {/* Logout Section */}
              <div className="space-y-0.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsProfileOpen(false);
                    if (onSignOut) onSignOut();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium text-red-600 rounded-xl hover:bg-red-50 transition-all group"
                >
                  <div className="p-1 rounded-lg bg-red-50 text-red-500 group-hover:bg-white group-hover:shadow-sm transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </div>
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header >
  );
}
