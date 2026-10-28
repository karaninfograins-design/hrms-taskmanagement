"use client";

import { useState, useEffect, isValidElement } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { User } from "@/types/auth";
import Link from "next/link";
import {
  Menu,
  LogOut,
  LayoutDashboard,
  FolderGit2,
  Users,
  Briefcase,
  MessageSquare,
  Users2,
  Phone,
  Clock,
  CalendarCheck,
  CalendarDays,
  SlidersHorizontal,
  Video,
  CalendarRange,
  ShieldCheck,
  UserCheck,
  Settings,
  User as UserIcon,
} from "lucide-react";

type SidebarProps = {
  user?: User;
  canCreateAdmins?: boolean;
  onSignOut?: () => void;
};

interface NavigationItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }> | React.ReactNode;
  active?: boolean;
}

function NavigationLink({ label, href, icon, isCollapsed }: NavigationItem & { isCollapsed: boolean }) {
  const pathname = usePathname();

  const isActive =
    href !== "#" &&
    (pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(`${href}/`)));

  const renderIcon = () => {
    if (isValidElement(icon)) {
      return icon;
    }
    if (icon) {
      const IconComp = icon as React.ComponentType<{ size?: number; className?: string }>;
      return <IconComp size={15} className="shrink-0" />;
    }
    return null;
  };

  return (
    <Link
      className={`sidebar-link ${isActive ? "active" : ""}`}
      href={href}
      title={isCollapsed ? label : undefined}
      aria-current={isActive ? "page" : undefined}
      scroll={false}
    >
      <span className="sidebar-link-icon" aria-hidden="true">
        {renderIcon()}
      </span>
      {!isCollapsed && <span>{label}</span>}
    </Link>
  );
}

function NavigationGroup({ title, items, isCollapsed }: { title: string; items: NavigationItem[]; isCollapsed: boolean }) {
  return (
    <div className="sidebar-menu-group">
      {title && !isCollapsed && <p className="sidebar-menu-label">{title}</p>}
      {items.map((item) => (
        <NavigationLink key={item.label} {...item} isCollapsed={isCollapsed} />
      ))}
    </div>
  );
}

function SidebarBrand({ isCollapsed, onToggle }: { isCollapsed: boolean; onToggle: () => void }) {
  return (
    <div className={`sidebar-brand ${isCollapsed ? "flex flex-col items-center gap-2 p-0 pb-3" : "flex items-center justify-between gap-2"}`}>
      {!isCollapsed ? (
        <>
          <div className="bg-white rounded-xl px-2 py-1 border border-slate-200/90 shadow-xs flex items-center justify-center max-w-[155px] overflow-hidden">
            <img
              src="/infograin_logo.jpg"
              alt="Infograins Software Solutions"
              className="object-contain max-h-7 w-auto"
              loading="eager"
              decoding="sync"
            />
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="sidebar-toggle-btn shrink-0"
            title="Collapse Sidebar"
            aria-label="Collapse Sidebar"
          >
            <Menu className="w-4 h-4 text-slate-300 hover:text-white" />
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2.5 w-full">
          <button
            type="button"
            onClick={onToggle}
            className="sidebar-toggle-btn"
            title="Expand Sidebar"
            aria-label="Expand Sidebar"
          >
            <Menu className="w-4 h-4 text-slate-300 hover:text-white" />
          </button>
          <div className="bg-white p-1 rounded-xl border border-slate-200/90 shadow-xs flex items-center justify-center w-9 h-9 overflow-hidden">
            <img
              src="/icon.png"
              alt="Infograins"
              className="object-contain max-h-7 w-auto"
              loading="eager"
              decoding="sync"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarFooter({ isCollapsed }: { isCollapsed: boolean }) {
  if (isCollapsed) return null;
  return <p className="sidebar-footer">Infograins HRMS</p>;
}

function SidebarLogout({ user, canCreateAdmins, onSignOut, isCollapsed }: { user: User; canCreateAdmins: boolean; onSignOut: () => void; isCollapsed: boolean }) {
  const roleName = typeof user?.role === "string" ? user.role : (user?.role as any)?.name || "";

  if (isCollapsed) {
    return (
      <div className="mt-auto pt-4 border-t border-[#1e3a8a]/70 flex flex-col items-center gap-2">
        <span className="sidebar-link-icon" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} title={`${user.name} (${roleName || "Employee"})`}>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <button
          onClick={onSignOut}
          title="Sign out"
          className="w-8 h-8 rounded-lg bg-[#1e293b] hover:bg-rose-900 text-rose-300 flex items-center justify-center text-xs transition-colors cursor-pointer"
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 8px 10px', borderTop: '1px solid rgba(30, 58, 138, 0.7)', marginTop: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '16px' }}>
        <span className="sidebar-link-icon" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div style={{ overflow: 'hidden' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.82rem', color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{user.name}</p>
          <small style={{ color: '#94a3b8', fontSize: '0.70rem', textTransform: 'uppercase' }}>{roleName ? roleName.replace(/_/g, " ") : "EMPLOYEE"}</small>
        </div>
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="w-full py-2 rounded-lg bg-[#1e293b] hover:bg-rose-950/70 text-rose-300 font-bold text-xs border border-[#1e3a8a]/80 transition-all cursor-pointer"
      >
        Sign out
      </button>
    </div>
  );
}

const primaryNavigation: { title: string; items: NavigationItem[] } = {
  title: "",
  items: [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  ]
};

const workspaceNavigation: { title: string; items: NavigationItem[] } = {
  title: "Work Management",
  items: [
    { label: "Projects", href: "/dashboard/projects", icon: FolderGit2 },
  ]
};

const peopleNavigation: { title: string; items: NavigationItem[] } = {
  title: "People",
  items: [
    { label: "Employees", href: "/dashboard/employees", icon: Users },
    { label: "Designations", href: "/dashboard/designations", icon: Briefcase },
  ]
};

const messengerNavigation: { title: string; items: NavigationItem[] } = {
  title: "Messenger",
  items: [
    { label: "Chats", href: "/dashboard/messenger/chats", icon: MessageSquare },
    { label: "Groups", href: "/dashboard/messenger/groups", icon: Users2 },
    { label: "Calls", href: "/dashboard/messenger/calls", icon: Phone },
  ],
};

const hrNavigation: { title: string; items: NavigationItem[] } = {
  title: "HR & Attendance",
  items: [
    { label: "Attendance", href: "/dashboard/attendance", icon: Clock },
    { label: "Leave Management", href: "/dashboard/leaves", icon: CalendarCheck },
    { label: "Company Calendar", href: "/dashboard/company-calendar", icon: CalendarDays },
    { label: "HRMS", href: "/dashboard/hr-settings", icon: SlidersHorizontal },
  ]
};

const collaborationNavigation: { title: string; items: NavigationItem[] } = {
  title: "Collaboration",
  items: [
    { label: "Meetings", href: "/dashboard/meetings", icon: Video },
    { label: "Meeting Calendar", href: "/dashboard/meetings/calendar", icon: CalendarRange },
  ]
};

const administrationNavigation: { title: string; items: NavigationItem[] } = {
  title: "Administration",
  items: [
    { label: "Roles & permissions", href: "/dashboard/roles", icon: ShieldCheck },
  ]
};

const personalNavigation: { title: string; items: NavigationItem[] } = {
  title: "",
  items: [
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
    { label: "My profile", href: "/dashboard/profile", icon: UserIcon },
  ]
};

export function Sidebar({ user, canCreateAdmins = false, onSignOut }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("hrms_sidebar_collapsed") === "true";
      } catch {
        return false;
      }
    }
    return false;
  });

  const toggleSidebar = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    try {
      localStorage.setItem("hrms_sidebar_collapsed", String(nextState));
      window.dispatchEvent(new Event("hrms_sidebar_toggle"));
    } catch { }
  };

  useEffect(() => {
    const handleSync = () => {
      try {
        const saved = localStorage.getItem("hrms_sidebar_collapsed");
        setIsCollapsed(saved === "true");
      } catch { }
    };
    window.addEventListener("hrms_sidebar_toggle", handleSync);
    return () => window.removeEventListener("hrms_sidebar_toggle", handleSync);
  }, []);

  const roleName = typeof user?.role === "string" ? user.role : (user?.role as any)?.name || (user?.role === 1 ? "SUPER_ADMIN" : user?.role === 2 ? "ADMIN" : "EMPLOYEE");
  const userRoleId = typeof user?.role === "number" ? user?.role : (user?.role as any)?.id || (roleName === "SUPER_ADMIN" ? 1 : roleName === "ADMIN" ? 2 : 3);
  const isSuperAdmin = roleName === "SUPER_ADMIN" || userRoleId === 1;
  const isAdminUser = isSuperAdmin || roleName === "ADMIN" || userRoleId === 2;

  const hrItems = hrNavigation.items.filter(
    (item) => item.href !== "/dashboard/hr-settings" || isAdminUser
  );

  const peopleItems = peopleNavigation.items.filter(
    (item) => item.href !== "/dashboard/designations" || isAdminUser
  );

  const personalItems = personalNavigation.items.filter(
    (item) => item.href !== "/dashboard/settings" || isAdminUser
  );

  const administrationItems: NavigationItem[] = [
    ...administrationNavigation.items,
    ...(canCreateAdmins || isSuperAdmin
      ? [{ label: "System Admins", href: "/dashboard/admins", icon: UserCheck }]
      : []),
  ];

  return (
    <aside
      className={`sidebar ${isCollapsed ? "collapsed" : ""}`}
      aria-label="Dashboard navigation"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      <SidebarBrand isCollapsed={isCollapsed} onToggle={toggleSidebar} />

      <nav className="sidebar-menu" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <NavigationGroup title={primaryNavigation.title} items={primaryNavigation.items} isCollapsed={isCollapsed} />
        <NavigationGroup title={messengerNavigation.title} items={messengerNavigation.items} isCollapsed={isCollapsed} />
        <NavigationGroup title={workspaceNavigation.title} items={workspaceNavigation.items} isCollapsed={isCollapsed} />
        <NavigationGroup title={peopleNavigation.title} items={peopleItems} isCollapsed={isCollapsed} />
        <NavigationGroup title={hrNavigation.title} items={hrItems} isCollapsed={isCollapsed} />
        <NavigationGroup title={collaborationNavigation.title} items={collaborationNavigation.items} isCollapsed={isCollapsed} />
        {isAdminUser && <NavigationGroup title={administrationNavigation.title} items={administrationItems} isCollapsed={isCollapsed} />}
        <NavigationGroup title={personalNavigation.title} items={personalItems} isCollapsed={isCollapsed} />
      </nav>

      {user && onSignOut && (
        <SidebarLogout
          user={user}
          canCreateAdmins={canCreateAdmins}
          onSignOut={onSignOut}
          isCollapsed={isCollapsed}
        />
      )}

      <SidebarFooter isCollapsed={isCollapsed} />
    </aside>
  );
}
