"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Menu,
  Bell,
  Search,
  X,
  LayoutDashboard,
  FolderGit2,
  Users,
  Briefcase,
  MessageSquare,
  Phone,
  Video,
  Clock,
  LogOut,
  Calendar,
  Settings,
  ShieldCheck,
  UserCheck,
  ArrowRight,
} from "lucide-react";
import type { User } from "@/types/auth";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllNotifications,
  invalidateNotificationCache,
  type AppNotification,
} from "@/services/notification.service";
import { UnauthorizedError } from "@/services/api";
import { playRingtone } from "@/lib/ringtone";
import { buildApiUrl } from "@/lib/api-config";
import { showSuccessToast, showErrorToast, showConfirmDialog } from "@/lib/swal";

type NavbarProps = {
  user?: User | null;
  onSignOut?: () => void;
};

type NavigationTarget = {
  title: string;
  category: string;
  href: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
};

const SIDEBAR_SEARCH_PAGES: NavigationTarget[] = [
  // Overview
  { title: "Dashboard", category: "Overview", href: "/dashboard", keywords: "home main kpi metrics stats overview", icon: LayoutDashboard },

  // Work Management
  { title: "Projects & Tasks", category: "Work Management", href: "/dashboard/projects", keywords: "projects jira sprint tasks work backlog board", icon: FolderGit2 },

  // People
  { title: "Employees Directory", category: "People", href: "/dashboard/employees", keywords: "employees staff team members users directory people", icon: Users },
  { title: "Designations", category: "People", href: "/dashboard/designations", keywords: "designations roles departments titles jobs", icon: Briefcase, adminOnly: true },

  // Messenger
  { title: "Direct Chats", category: "Messenger", href: "/dashboard/messenger/chats", keywords: "chat messenger messages direct dm conversation communication", icon: MessageSquare },
  { title: "Group Chats", category: "Messenger", href: "/dashboard/messenger/groups", keywords: "groups team channels group chat rooms messaging", icon: Users },
  { title: "Audio & Video Calls", category: "Messenger", href: "/dashboard/messenger/calls", keywords: "calls voice audio video meeting webrtc phone calling", icon: Phone },

  // HR & Attendance
  { title: "Attendance & Logs", category: "HR & Attendance", href: "/dashboard/attendance", keywords: "attendance punch clock time tracker presence logs", icon: Clock },
  { title: "Leave Management", category: "HR & Attendance", href: "/dashboard/leaves", keywords: "leave timeoff holiday vacation sick request balance", icon: Calendar },
  { title: "Company Calendar", category: "HR & Attendance", href: "/dashboard/company-calendar", keywords: "calendar events company holidays schedule dates", icon: Calendar },
  { title: "HRMS Settings", category: "HR & Attendance", href: "/dashboard/hr-settings", keywords: "hr settings policies work hours config hrms", icon: Settings, adminOnly: true },

  // Collaboration
  { title: "Meetings", category: "Collaboration", href: "/dashboard/meetings", keywords: "meetings video livekit conference calls schedule agenda", icon: Video },
  { title: "Meeting Calendar", category: "Collaboration", href: "/dashboard/meetings/calendar", keywords: "meetings calendar schedule upcoming appointments", icon: Calendar },

  // Administration
  { title: "Roles & Permissions", category: "Administration", href: "/dashboard/roles", keywords: "roles permissions access security admin authorization", icon: ShieldCheck, adminOnly: true },
  { title: "Admins Management", category: "Administration", href: "/dashboard/admins", keywords: "admins superadmin management accounts users", icon: UserCheck, superAdminOnly: true },

  // Account
  { title: "My Profile", category: "Account", href: "/dashboard/profile", keywords: "profile account user details password personal info", icon: UserCheck },
  { title: "Settings", category: "Account", href: "/dashboard/settings", keywords: "settings preferences preferences configuration theme", icon: Settings, adminOnly: true },
];

// Today Attendance cache to prevent redundant HTTP calls during page transitions
type TodayAttendanceData = {
  id: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  workingHours: number;
} | null;

let cachedTodayAttendance: {
  token: string;
  attendance: TodayAttendanceData;
  timestamp: number;
} | null = null;

let inflightTodayAttendancePromise: Promise<TodayAttendanceData> | null = null;
const TODAY_ATTENDANCE_CACHE_TTL = 60 * 1000; // 60s cache

export function invalidateTodayAttendanceCache() {
  cachedTodayAttendance = null;
  inflightTodayAttendancePromise = null;
}

export function Navbar({ user, onSignOut }: NavbarProps) {
  const router = useRouter();
  const { session, logout } = useAuth();
  const { socket } = useSocket();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // Track if the token has been confirmed expired so we stop polling immediately
  const tokenExpiredRef = useRef(false);

  // Reset the expired flag whenever the session token changes (new login)
  useEffect(() => {
    tokenExpiredRef.current = false;
  }, [session?.token]);

  // Search Bar State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedSearchIdx, setSelectedSearchIdx] = useState(0);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    if (!session?.token || tokenExpiredRef.current) return;
    setLoadingNotifs(true);
    try {
      const res = await getNotifications(session.token);
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        // Token expired — stop polling and log out
        tokenExpiredRef.current = true;
        console.warn("[Navbar] Session expired, logging out.");
        logout();
        router.replace("/");
      }
    } finally {
      setLoadingNotifs(false);
    }
  }, [session?.token, logout, router]);

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [fetchNotifs]);

  // Attendance & Clock In / Out State
  const [todayAttendance, setTodayAttendance] = useState<{
    id: number;
    date: string;
    checkIn: string | null;
    checkOut: string | null;
    status: string;
    workingHours: number;
  } | null>(null);
  const [clockActionLoading, setClockActionLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fetchTodayAttendance = useCallback(async (forceRefresh = false) => {
    if (!session?.token || tokenExpiredRef.current) return;
    const now = Date.now();
    if (
      !forceRefresh &&
      cachedTodayAttendance &&
      cachedTodayAttendance.token === session.token &&
      now - cachedTodayAttendance.timestamp < TODAY_ATTENDANCE_CACHE_TTL
    ) {
      setTodayAttendance(cachedTodayAttendance.attendance);
      return;
    }

    if (inflightTodayAttendancePromise && !forceRefresh) {
      try {
        const attendance = await inflightTodayAttendancePromise;
        setTodayAttendance(attendance);
      } catch {
        // non-blocking
      }
      return;
    }

    try {
      inflightTodayAttendancePromise = fetch(buildApiUrl("/api/attendance/today"), {
        headers: { Authorization: `Bearer ${session.token}` },
      })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            const attendance = data.attendance || null;
            cachedTodayAttendance = { token: session.token, attendance, timestamp: Date.now() };
            return attendance;
          }
          return null;
        })
        .finally(() => {
          inflightTodayAttendancePromise = null;
        });

      const attendance = await inflightTodayAttendancePromise;
      setTodayAttendance(attendance);
    } catch {
      // Non-blocking for navbar
    }
  }, [session?.token]);

  useEffect(() => {
    fetchTodayAttendance();
    const handleAttendanceChange = () => {
      invalidateTodayAttendanceCache();
      void fetchTodayAttendance(true);
    };
    window.addEventListener("hrms-attendance-change", handleAttendanceChange);
    return () => {
      window.removeEventListener("hrms-attendance-change", handleAttendanceChange);
    };
  }, [fetchTodayAttendance]);

  // Live timer tick when clocked in and not clocked out
  useEffect(() => {
    if (!todayAttendance?.checkIn || todayAttendance?.checkOut) {
      setElapsedSeconds(0);
      return;
    }

    const checkInMs = new Date(todayAttendance.checkIn).getTime();
    const updateElapsed = () => {
      const diffSecs = Math.max(0, Math.floor((Date.now() - checkInMs) / 1000));
      setElapsedSeconds(diffSecs);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [todayAttendance?.checkIn, todayAttendance?.checkOut]);

  const formatElapsed = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  };

  const handleClockIn = async () => {
    if (!session?.token || clockActionLoading) return;
    const confirmed = await showConfirmDialog({
      title: "Clock In?",
      text: "Are you sure you want to clock in and start your shift?",
      confirmButtonText: "Yes, Clock In",
      cancelButtonText: "Cancel",
      icon: "question",
      confirmButtonColor: "#f97316",
    });
    if (!confirmed) return;

    setClockActionLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/attendance/check-in"), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to clock in");
      }
      showSuccessToast("Clocked in successfully!");
      invalidateTodayAttendanceCache();
      await fetchTodayAttendance(true);
      window.dispatchEvent(new Event("hrms-attendance-change"));
    } catch (err: any) {
      showErrorToast(err.message || "Failed to clock in");
    } finally {
      setClockActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!session?.token || clockActionLoading) return;
    const confirmed = await showConfirmDialog({
      title: "Clock Out?",
      text: "Are you sure you want to clock out and end your shift?",
      confirmButtonText: "Yes, Clock Out",
      cancelButtonText: "Cancel",
      icon: "question",
      confirmButtonColor: "#ea580c",
    });
    if (!confirmed) return;

    setClockActionLoading(true);
    try {
      const res = await fetch(buildApiUrl("/api/attendance/check-out"), {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to clock out");
      }
      showSuccessToast("Clocked out successfully!");
      invalidateTodayAttendanceCache();
      await fetchTodayAttendance(true);
      window.dispatchEvent(new Event("hrms-attendance-change"));
    } catch (err: any) {
      showErrorToast(err.message || "Failed to clock out");
    } finally {
      setClockActionLoading(false);
    }
  };

  useEffect(() => {
    if (!socket) return;
    const onNotificationCreated = () => {
      invalidateNotificationCache();
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
      try {
        playRingtone();
      } catch { }
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

  const currentUser = session?.user || user;
  const roleName = typeof currentUser?.role === "string"
    ? currentUser.role
    : (currentUser?.role as any)?.name || (currentUser?.role === 1 ? "SUPER_ADMIN" : currentUser?.role === 2 ? "ADMIN" : currentUser?.role === 3 ? "HR" : "EMPLOYEE");
  const userRoleId = typeof currentUser?.role === "number"
    ? currentUser?.role
    : (currentUser?.role as any)?.id || (roleName === "SUPER_ADMIN" ? 1 : roleName === "ADMIN" ? 2 : roleName === "HR" ? 3 : 4);
  const isSuperAdmin = roleName === "SUPER_ADMIN" || userRoleId === 1;
  const isAdminUser = isSuperAdmin || roleName === "ADMIN" || roleName === "HR" || userRoleId === 2 || userRoleId === 3;

  const userPermissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
  const canViewRoles = isSuperAdmin || userPermissions.includes("VIEW_PERMISSIONS") || userPermissions.includes("MANAGE_PERMISSIONS") || userPermissions.includes("MANAGE_ROLES") || userPermissions.includes("admin:role_manage");

  const accessiblePages = useMemo(() => {
    return SIDEBAR_SEARCH_PAGES.filter((p) => {
      if (p.superAdminOnly && !isSuperAdmin) return false;
      if (p.adminOnly && !isAdminUser) return false;
      if (p.href === "/dashboard/roles" && !canViewRoles) return false;
      return true;
    });
  }, [isAdminUser, isSuperAdmin, canViewRoles]);

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return accessiblePages.slice(0, 6);
    }
    return accessiblePages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.keywords.toLowerCase().includes(q)
    );
  }, [accessiblePages, searchQuery]);

  useEffect(() => {
    setSelectedSearchIdx(0);
  }, [searchQuery]);

  const handleSelectPage = (href: string) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    router.push(href);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchOpen) {
      if (e.key === "ArrowDown") {
        setIsSearchOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSearchIdx((prev) => (prev + 1) % filteredPages.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSearchIdx((prev) => (prev - 1 + filteredPages.length) % filteredPages.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredPages[selectedSearchIdx]) {
        handleSelectPage(filteredPages[selectedSearchIdx].href);
      }
    } else if (e.key === "Escape") {
      setIsSearchOpen(false);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
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
      {/* Brand Title & Logo on Left */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("hrms_sidebar_mobile_toggle"))}
          className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          title="Toggle Navigation Menu"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5 text-slate-700" />
        </button>

        <Link
          href="/dashboard"
          className="flex items-center gap-2 sm:gap-3 group transition-all active:scale-[0.98] select-none"
          aria-label="Infograins HRMS dashboard"
        >
          <div className="flex items-center gap-2 sm:gap-2.5">
            <img
              src="/logo-infograins.webp"
              alt="Infograins Software Solutions"
              className="h-7 sm:h-8 w-auto object-contain"
              loading="eager"
            />
            {/* Product identifier */}
            {/* <span className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-orange-200/80 bg-orange-50 px-2 py-1 text-[9px] font-extrabold uppercase leading-none tracking-[0.045em] text-orange-700 transition-all duration-200 hover:border-orange-300 hover:bg-orange-100 sm:text-[10px]">
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-40" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
                </span>
                <span>HRMS &amp; Task Management</span>
              </span> */}
          </div>
        </Link>
      </div>

      {/* Mobile Full-Width Search Overlay Bar */}
      {isMobileSearchOpen && (
        <div className="absolute inset-0 z-50 bg-white flex items-center px-3 sm:px-6 gap-2 animate-in fade-in duration-150">
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none z-10" />
            <input
              ref={mobileSearchInputRef}
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
                setSelectedSearchIdx(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search pages, projects, employees..."
              className="w-full h-10 !pl-11 pr-10 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-900 placeholder:text-slate-400 shadow-2xs"
              style={{ paddingLeft: "42px" }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsMobileSearchOpen(false);
              setIsSearchOpen(false);
              setSearchQuery("");
            }}
            className="p-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Desktop Search Bar (hidden on small mobile screens to keep navbar responsive) */}
      <div className="relative flex-1 min-w-0 max-w-none sm:max-w-sm md:max-w-md mx-1 sm:mx-4 hidden sm:block" ref={searchRef}>
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none z-10" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
              setSelectedSearchIdx(0);
            }}
            onFocus={() => setIsSearchOpen(true)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search..."
            className="w-full h-10 !pl-11 pr-12 sm:pr-14 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-900 placeholder:text-slate-400 shadow-2xs"
            style={{ paddingLeft: "42px" }}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setIsSearchOpen(false);
              }}
              className="absolute right-3 p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="absolute right-2.5 hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] font-extrabold text-slate-400 bg-white border border-slate-200 rounded-md shadow-2xs">
              Ctrl K
            </kbd>
          )}
        </div>

        {/* Dropdown Results */}
        {isSearchOpen && (
          <div className="absolute left-0 sm:right-0 w-[calc(100vw-28px)] sm:w-auto sm:min-w-full max-w-sm mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 z-[1000] overflow-hidden max-h-96 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="p-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>{searchQuery ? `Matching Pages (${filteredPages.length})` : "Quick Navigation"}</span>
              <span className="hidden sm:inline">Press Enter to select</span>
            </div>
            {filteredPages.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching pages found for "{searchQuery}".
              </div>
            ) : (
              <div className="p-1 space-y-0.5">
                {filteredPages.map((page, idx) => {
                  const PageIcon = page.icon;
                  const isSelected = idx === selectedSearchIdx;
                  return (
                    <button
                      key={page.href}
                      type="button"
                      onMouseEnter={() => setSelectedSearchIdx(idx)}
                      onClick={() => handleSelectPage(page.href)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-all cursor-pointer ${isSelected
                        ? "bg-orange-500 text-white font-bold"
                        : "hover:bg-slate-50 text-slate-800"
                        }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-600"
                            }`}
                        >
                          <PageIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="truncate">
                          <p className="font-semibold truncate">{page.title}</p>
                          <p
                            className={`text-[10px] truncate ${isSelected ? "text-orange-100" : "text-slate-400"
                              }`}
                          >
                            {page.category}
                          </p>
                        </div>
                      </div>
                      <ArrowRight
                        className={`w-3.5 h-3.5 shrink-0 transition-transform ${isSelected ? "text-white translate-x-0.5" : "text-slate-300"
                          }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        {/* Mobile Search Trigger Icon Button */}
        <button
          type="button"
          onClick={() => {
            setIsMobileSearchOpen(true);
            setIsSearchOpen(true);
            setTimeout(() => mobileSearchInputRef.current?.focus(), 50);
          }}
          className="sm:hidden p-2 text-slate-600 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors shrink-0"
          style={{ border: "none", background: "none", cursor: "pointer" }}
          aria-label="Search"
          title="Search navigation"
        >
          <Search className="w-5 h-5 text-slate-700" />
        </button>

        {/* Clock In / Clock Out Attendance Tracker Widget */}
        {session?.user && (
          <div className="flex items-center shrink-0">
            {!todayAttendance?.checkIn ? (
              <button
                type="button"
                onClick={handleClockIn}
                disabled={clockActionLoading}
                title="Clock in for today's shift"
                className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-[11px] sm:text-xs border border-slate-700/80 shadow-xs hover:border-slate-600 transition-all duration-200 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <div className="relative flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-400 transition-colors" />
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <span className="tracking-tight">Clock In</span>
              </button>
            ) : !todayAttendance?.checkOut ? (
              <div className="inline-flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1 rounded-xl bg-slate-900 border border-slate-700/90 text-white shadow-xs">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
                  </span>
                  <span className="hidden md:inline text-[9px] font-black uppercase tracking-widest text-slate-400 select-none">
                    SHIFT
                  </span>
                </div>
                <span className="font-mono font-black text-xs sm:text-[13px] text-emerald-400 tracking-wider tabular-nums select-none">
                  {formatElapsed(elapsedSeconds)}
                </span>
                <button
                  type="button"
                  onClick={handleClockOut}
                  disabled={clockActionLoading}
                  title="Click to Clock Out and end shift"
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-medium text-[10px] sm:text-[11px] shadow-xs hover:shadow-sm transition-all duration-150 active:scale-95 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[2.5]" />
                  <span className="hidden sm:inline">Clock Out</span>
                  <span className="sm:hidden">Out</span>
                </button>
              </div>
            ) : (
              <div
                title={`Shift completed: ${todayAttendance.workingHours.toFixed(2)} hrs worked today`}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-[11px] sm:text-xs font-bold shadow-xs select-none"
              >
                <span className="text-emerald-400 font-black">✓</span>
                <span className="font-mono font-extrabold text-white tabular-nums">
                  {todayAttendance.workingHours.toFixed(1)}h
                </span>
                <span className="text-slate-400 font-medium text-[10px] hidden sm:inline">worked</span>
              </div>
            )}
          </div>
        )}

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
            <Bell className="w-5 h-5 text-slate-700" />
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
                width: "min(360px, calc(100vw - 24px))",
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
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e3a3a3ff")}
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
        <div className="relative shrink-0" ref={profileRef}>
          {/* Trigger Button */}
          <button
            type="button"
            onClick={() => {
              setIsProfileOpen(!isProfileOpen);
              setIsNotifOpen(false);
            }}
            aria-expanded={isProfileOpen}
            aria-haspopup="true"
            className="flex items-center gap-1 sm:gap-2.5 p-1 sm:p-1.5 rounded-xl hover:bg-gray-100/80 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-900/10 shrink-0"
            style={{ background: "none", border: "none", cursor: "pointer" }}
            aria-label="User profile menu"
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name || "User"}
                className="w-8 h-8 rounded-full object-cover shrink-0 ring-2 ring-orange-500/20"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-900 to-gray-700 text-white font-bold text-xs flex items-center justify-center shadow-inner shrink-0 ring-2 ring-orange-500/20">
                {user?.name?.slice(0, 1).toUpperCase() ?? "U"}
              </div>
            )}
            <span className="text-xs sm:text-sm font-semibold text-gray-700 hidden md:inline-block max-w-[120px] truncate">
              {user?.name ?? ""}
            </span>
            <svg
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 transition-transform duration-200 shrink-0 ${isProfileOpen ? 'rotate-180' : ''}`}
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
              className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-24px)] origin-top-right rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl ring-1 ring-black/5 focus:outline-none z-[1000] p-1.5 animate-in fade-in zoom-in-95 duration-100"
            >
              {/* User Info Header */}
              <div className="px-3 py-2.5 mb-1 rounded-xl bg-gray-50/80 border border-gray-100">
                <p className="text-[8px] font-semibold text-gray-400 uppercase tracking-wider">Signed in as</p>
                <p className="text-xs font-semibold text-gray-900 truncate mt-0.5">{user?.email || user?.name || "User"}</p>
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
