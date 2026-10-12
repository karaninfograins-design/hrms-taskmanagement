"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CompanyLogo } from "@/components/common/company-logo";
import type { User } from "@/types/auth";
import { useAuth } from "@/hooks/use-auth";
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
                      color: "#2563eb",
                      fontSize: "0.78rem",
                      fontWeight: 600,
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
                        backgroundColor: notif.isRead ? "#ffffff" : "#f0f9ff",
                        cursor: "pointer",
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-start",
                        transition: "background-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = notif.isRead ? "#f8fafc" : "#e0f2fe";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = notif.isRead ? "#ffffff" : "#f0f9ff";
                      }}
                    >
                      <span
                        style={{
                          fontSize: "1.2rem",
                          backgroundColor: "#f1f5f9",
                          padding: "6px",
                          borderRadius: "10px",
                          lineHeight: 1,
                        }}
                      >
                        {getNotifIcon(notif.type)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                          <strong style={{ fontSize: "0.85rem", color: "#1e293b", fontWeight: 700 }}>
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
                            backgroundColor: "#2563eb",
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
        <div className="profile" ref={profileRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setIsProfileOpen(!isProfileOpen);
              setIsNotifOpen(false);
            }}
            className="flex items-center gap-2"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span className="avatar" aria-hidden="true">
              {user.name.slice(0, 1)}
            </span>
            <div>
              <strong>{user.name}</strong>
            </div>
          </button>

          {isProfileOpen && (
            <div className="absolute top-full right-0 mt-2 min-w-[150px] z-[1000] bg-white rounded-2xl shadow-lg border border-gray-200 p-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push("/dashboard/profile");
                  setIsProfileOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50"
              >
                My Profile
              </button>
              {/* <div className="border-t border-gray-200 my-1"></div> */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsProfileOpen(false);
                  if (onSignOut) onSignOut();
                }}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-red-400 hover:bg-red-50 mt-1"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header >
  );
}
