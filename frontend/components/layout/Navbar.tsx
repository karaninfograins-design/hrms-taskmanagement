"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CompanyLogo } from "@/components/common/company-logo";
import type { User } from "@/types/auth";

type NavbarProps = {
  user: User;
  onSignOut?: () => void;
};

export function Navbar({ user, onSignOut }: NavbarProps) {
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleProfileClick = () => {
    router.push("/dashboard/profile");
    setIsDropdownOpen(false);
  };

  const handleLogout = () => {
    setIsDropdownOpen(false);
    if (onSignOut) {
      onSignOut();
    }
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  const roleName = typeof user?.role === "string" ? user.role : (user?.role as any)?.name || "";

  return (
    <header className="topbar">
      <Link className="brand" href="/dashboard" aria-label="Infograins HRMS dashboard">
        <CompanyLogo />
      </Link>

      <div className="profile" ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={toggleDropdown}
          className="flex items-center gap-2"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span className="avatar" aria-hidden="true">
            {user.name.slice(0, 1)}
          </span>
          <div>
            <strong>{user.name}</strong>
            {/* <small>{roleName ? roleName.replace(/_/g, " ") : "EMPLOYEE"}</small> */}
          </div>
        </button>

        {isDropdownOpen && (
          <div
            className="absolute top-full right-0 mt-2 min-w-[150px] z-[1000] bg-white rounded-2xl shadow-lg border border-gray-200 p-1"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleProfileClick();
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-gray-50"
            >
              <span>👤</span>
              My Profile
            </button>
            <div className="border-t border-gray-200"></div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleLogout();
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-red-400 hover:bg-red-50"
            >
              <span>🔒</span>
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
