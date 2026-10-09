"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { User } from "@/types/auth";
import Link from "next/link";

type SidebarProps = {
  user?: User;
  canCreateAdmins?: boolean;
  onSignOut?: () => void;
};

interface NavigationItem {
  label: string;
  href: string;
  icon: string;
  active?: boolean;
}

function NavigationLink({ label, href, icon, isCollapsed }: NavigationItem & { isCollapsed: boolean }) {
  const pathname = usePathname();

  const isActive =
    href !== "#" &&
    (pathname === href ||
      (href !== "/dashboard" && pathname.startsWith(`${href}/`)));

  return (
    <Link
      className={`sidebar-link ${isActive ? "active" : ""}`}
      href={href}
      title={isCollapsed ? label : undefined}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="sidebar-link-icon" aria-hidden="true">
        {icon}
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
    <div className="sidebar-brand">
      <div className="flex items-center gap-2.5">
        <Image
          className="sidebar-logo"
          src="/icon.png"
          alt="Infograins icon"
          width={34}
          height={34}
        />
        {!isCollapsed && (
          <div className="sidebar-brand-text">
            <strong className="text-white text-sm leading-tight">HRMS</strong>
            <small className="text-slate-400 text-[10px]">Task Management</small>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="sidebar-toggle-btn"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? "➔" : "⬅"}
      </button>
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
      <div className="mt-auto pt-4 border-t border-slate-800 flex flex-col items-center gap-2">
        <span className="sidebar-link-icon" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }} title={`${user.name} (${roleName || "Employee"})`}>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <button
          onClick={onSignOut}
          title="Sign out"
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-rose-900 text-rose-300 flex items-center justify-center text-xs transition-colors"
        >
          🔒
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 8px 10px', borderTop: '1px solid #1e293b', marginTop: 'auto' }}>
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
        className="w-full py-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-rose-300 font-bold text-xs border border-slate-700 transition-all"
      >
        Sign out
      </button>
    </div>
  );
}

const primaryNavigation = {
  title: "",
  items: [
    { label: "Dashboard", href: "/dashboard", icon: "DB" },
  ]
};

const workspaceNavigation = {
  title: "Work Management",
  items: [
    { label: "Projects", href: "/dashboard/projects", icon: "PR" },
  ]
};

const peopleNavigation = {
  title: "People",
  items: [
    { label: "Employees", href: "/dashboard/employees", icon: "EM" },
    { label: "Designations", href: "/dashboard/designations", icon: "DG" },
  ]
};

const messengerNavigation = {
  title: "Messenger",
  items: [
    { label: "Chats", href: "/dashboard/messenger/chats", icon: "💬" },
    { label: "Groups", href: "/dashboard/messenger/groups", icon: "👥" },
    { label: "Calls", href: "/dashboard/messenger/calls", icon: "📞" },
  ],
};

const hrNavigation = {
  title: "HR & Attendance",
  items: [
    { label: "Attendance", href: "/dashboard/attendance", icon: "AT" },
    { label: "Leave Management", href: "/dashboard/leaves", icon: "LV" },
    { label: "Company Calendar", href: "/dashboard/company-calendar", icon: "CC" },
    { label: "HRMS", href: "/dashboard/hr-settings", icon: "HS" },
  ]
};

const collaborationNavigation = {
  title: "Collaboration",
  items: [
    { label: "Meetings", href: "/dashboard/meetings", icon: "📅" },
    { label: "Meeting Calendar", href: "/dashboard/meetings/calendar", icon: "📆" },
  ]
};

const administrationNavigation = {
  title: "Administration",
  items: [
    { label: "Roles & permissions", href: "/dashboard/roles", icon: "RP" },
  ]
};

const personalNavigation = {
  title: "",
  items: [
    { label: "Settings", href: "/dashboard/settings", icon: "ST" },
    { label: "My profile", href: "/dashboard/profile", icon: "MP" },
  ]
};

export function Sidebar({ user, canCreateAdmins = false, onSignOut }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("hrms_sidebar_collapsed");
    if (saved === "true") {
      setIsCollapsed(true);
    }
  }, []);

  const toggleSidebar = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem("hrms_sidebar_collapsed", String(nextState));
  };

  useEffect(() => {
    const frame = document.querySelector(".dashboard-frame");
    if (frame) {
      if (isCollapsed) {
        frame.classList.add("collapsed-frame");
      } else {
        frame.classList.remove("collapsed-frame");
      }
    }
  }, [isCollapsed]);

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

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`} aria-label="Dashboard navigation">
      <SidebarBrand isCollapsed={isCollapsed} onToggle={toggleSidebar} />

      <nav className="sidebar-menu">
        <NavigationGroup title={primaryNavigation.title} items={primaryNavigation.items} isCollapsed={isCollapsed} />
        <NavigationGroup title={messengerNavigation.title} items={messengerNavigation.items} isCollapsed={isCollapsed} />
        <NavigationGroup title={workspaceNavigation.title} items={workspaceNavigation.items} isCollapsed={isCollapsed} />
        <NavigationGroup title={peopleNavigation.title} items={peopleItems} isCollapsed={isCollapsed} />
        <NavigationGroup title={hrNavigation.title} items={hrItems} isCollapsed={isCollapsed} />
        <NavigationGroup title={collaborationNavigation.title} items={collaborationNavigation.items} isCollapsed={isCollapsed} />
        {isAdminUser && <NavigationGroup title={administrationNavigation.title} items={administrationNavigation.items} isCollapsed={isCollapsed} />}
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
