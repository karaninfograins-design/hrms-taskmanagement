"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { updateProfile, changePassword } from "@/services/user.service";
import { getAuthToken } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api-config";
import type { User } from "@/types/auth";
import { ApplyLeaveModal } from "@/components/leaves/ApplyLeaveModal";

type ProfileFormData = {
  name: string;
  email: string;
  designation: string;
  phoneNumber: string;
  employeeCode: string;
  dob: string;
  gender: string;
  address: string;
  workLocation: string;
  employmentType: string;
};

type PasswordFormData = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const { session, isLoading, logout, saveSession } = useAuth();
  const [activeTab, setActiveTab] = useState<"profile" | "password">("profile");
  const [profileData, setProfileData] = useState<ProfileFormData>({
    name: "",
    email: "",
    designation: "",
    phoneNumber: "",
    employeeCode: "",
    dob: "",
    gender: "",
    address: "",
    workLocation: "OFFICE",
    employmentType: "FULL_TIME",
  });
  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [leaveBalances, setLeaveBalances] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);

  const fetchProfileLeaveData = async () => {
    const token = getAuthToken();
    if (token) {
      try {
        const [typesRes, balRes, reqRes] = await Promise.all([
          fetch(buildApiUrl("/api/leaves/types"), { headers: { Authorization: `Bearer ${token}` } }),
          fetch(buildApiUrl("/api/leaves/balances"), { headers: { Authorization: `Bearer ${token}` } }),
          fetch(buildApiUrl("/api/leaves/requests"), { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (typesRes.ok) {
          const tData = await typesRes.json();
          setLeaveTypes(tData.types || []);
        }
        if (balRes.ok) {
          const bData = await balRes.json();
          setLeaveBalances(bData.balances || []);
        }
        if (reqRes.ok) {
          const rData = await reqRes.json();
          setLeaveRequests(rData.requests || []);
        }
      } catch (err) {
        console.error("Profile leave fetch error", err);
      }
    }
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
    if (session?.user) {
      const prof = (session.user as any).employeeProfile;
      setProfileData({
        name: session.user.name || "",
        email: session.user.email || "",
        designation: session.user.designation || "",
        phoneNumber: session.user.phoneNumber || "",
        employeeCode: prof?.employeeCode || `EMP-${session.user.id}`,
        dob: prof?.dob ? prof.dob.split("T")[0] : "",
        gender: prof?.gender || "",
        address: prof?.address || "",
        workLocation: prof?.workLocation || "OFFICE",
        employmentType: prof?.employmentType || "FULL_TIME",
      });

      fetchProfileLeaveData();
    }
  }, [isLoading, router, session]);

  const handleProfileInputChange = (field: keyof ProfileFormData, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const handlePasswordInputChange = (field: keyof PasswordFormData, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setIsLoadingProfile(true);
    setError(null);
    setSuccess(null);

    try {
      const updateData = {
        name: profileData.name,
        designation: profileData.designation,
        phoneNumber: profileData.phoneNumber,
        dob: profileData.dob || undefined,
        gender: profileData.gender || undefined,
        address: profileData.address || undefined,
        workLocation: profileData.workLocation,
        employmentType: profileData.employmentType,
      };

      const result = await updateProfile(
        session.user.id,
        updateData,
        session.token
      );

      if (result && result.user) {
        saveSession({
          ...session,
          user: { ...session.user, ...result.user },
        });
        setSuccess("Profile information updated successfully!");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const userRoleStr = typeof session?.user.role === "string" ? session.user.role : (session?.user.role as any)?.name || "";
  const canCreateAdmins = userRoleStr === "SUPER_ADMIN";

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (passwordData.newPassword && passwordData.newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setIsLoadingPassword(true);
    setError(null);
    setSuccess(null);

    try {
      await changePassword(
        session.user.id,
        passwordData.currentPassword,
        passwordData.newPassword,
        session.token
      );

      setSuccess("Account password updated successfully!");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setIsLoadingPassword(false);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading profile...</main>;
  }

  // Get initials for avatar display
  const nameParts = profileData.name.trim().split(" ");
  const initials = nameParts.length >= 2
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : (profileData.name.slice(0, 2) || "U").toUpperCase();

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar
          user={session.user}
          canCreateAdmins={canCreateAdmins}
          onSignOut={handleSignOut}
        />
        <section className="dashboard-content" style={{ paddingBottom: "20px" }}>
          {/* Back Navigation */}
          {/* <button
            onClick={() => router.push("/dashboard")}
            className="back-button mb-4 text-xs font-bold text-[#F97316] hover:text-[#EA580C] flex items-center gap-1 cursor-pointer transition-colors"
          >
            ← Back to Dashboard
          </button> */}

          {/* Profile Header Banner */}
          <div className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#172554] via-[#1e3a6f] to-slate-900 p-4 text-white shadow-md">
            <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -right-2 -top-14 h-52 w-52 rounded-full border border-white/10" />

            <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
                {/* Avatar */}
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-[#172554] to-[#1e3a8a] text-2xl font-bold tracking-wider text-white shadow-md shadow-slate-900/10">
                  {initials}
                </div>

                {/* Name and metadata */}
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                      {profileData.name || "User Account"}
                    </h1>

                    {/* Role badge */}
                    <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-orange-200">
                      {userRoleStr}
                    </span>

                    {/* Account status */}
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Active Account
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-blue-100/80">
                    <span className="font-semibold text-white">
                      {profileData.designation || "Team Member"}
                    </span>
                    <span className="hidden text-blue-200/50 sm:inline">•</span>
                    <span className="break-all">
                      {profileData.email}
                    </span>
                    {profileData.workLocation && (
                      <>
                        <span className="hidden text-blue-200/50 sm:inline">•</span>
                        <span>📍 {profileData.workLocation}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Tabs in Banner */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("profile")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "profile"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "border border-white/15 bg-white/10 text-white hover:bg-white/20"
                    }`}
                >
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("password")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "password"
                    ? "bg-orange-500 text-white shadow-sm"
                    : "border border-white/15 bg-white/10 text-white hover:bg-white/20"
                    }`}
                >
                  Security
                </button>
              </div>
            </div>
          </div>

          {/* Main Grid Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Sidebar Info Card */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">Account Summary</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500">System Role</span>
                    <span className="text-xs font-extrabold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">{userRoleStr}</span>
                  </div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500">Designation</span>
                    <span className="text-xs font-extrabold text-slate-900">{profileData.designation || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-500">Contact Number</span>
                    <span className="text-xs font-extrabold text-slate-900">{profileData.phoneNumber || "Not provided"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">User ID</span>
                    <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">#{session.user.id || 1}</span>
                  </div>
                </div>
              </div>

              {/* Leave Status & Balances Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Leave Balances & Status</h3>
                  <button
                    onClick={() => setShowApplyModal(true)}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold text-[11px] shadow-xs transition-all cursor-pointer"
                  >
                    + Apply for Leave
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Paid Leave</span>
                    <p className="text-lg font-black text-slate-900 mt-0.5">
                      {leaveBalances.find(b => b.leaveType?.name?.toLowerCase().includes("paid"))?.remaining ?? 12}d
                      <span className="text-[10px] text-slate-400 font-normal"> / {leaveBalances.find(b => b.leaveType?.name?.toLowerCase().includes("paid"))?.allocated ?? 18}d</span>
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                    <span className="text-[10px] font-bold text-amber-600 uppercase">Vacant / Unpaid</span>
                    <p className="text-lg font-black text-amber-900 mt-0.5">
                      {leaveRequests
                        .filter((request) =>
                          request.status === "APPROVED" &&
                          /unpaid|vacant/i.test(request.leaveType?.name || "")
                        )
                        .reduce((total, request) => total + Number(request.totalDays || 0), 0)} days
                    </p>
                  </div>
                  <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase">Half Day Leaves</span>
                    <p className="text-lg font-black text-emerald-900 mt-0.5">
                      {leaveRequests.filter((request) => request.halfDayPeriod).length} Count
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-bold text-blue-600 uppercase">Pending Requests</span>
                    <p className="text-lg font-black text-blue-900 mt-0.5">
                      {leaveRequests.filter(r => r.status === "PENDING").length} Active
                    </p>
                  </div>
                </div>

                {leaveBalances.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    {leaveBalances.map(bal => (
                      <div key={bal.id} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-bold text-slate-600">
                          <span>{typeof bal.leaveType === "object" ? bal.leaveType?.name || "Leave" : String(bal.leaveType || "Leave")}</span>
                          <span>{bal.remaining} / {bal.allocated} days left</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-orange-500 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, (bal.remaining / bal.allocated) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xs">
                <h3 className="text-sm font-extrabold mb-2 flex items-center gap-2">
                  <span></span> Security & Privacy
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed mb-4">
                  Keep your personal contact details accurate to receive real-time notifications regarding assigned projects and sprint iterations.
                </p>
              </div>
            </div>

            {/* Right Main Form Section */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                {/* Tabs Header */}
                <div className="flex flex-wrap gap-2 sm:gap-4 border-b border-slate-100 pb-4 mb-6">
                  <button
                    type="button"
                    onClick={() => { setActiveTab("profile"); setError(null); setSuccess(null); }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${activeTab === "profile"
                      ? "bg-orange-50 text-orange-600 border border-orange-200 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                  >
                    <span>👤</span> Profile Information
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab("password"); setError(null); setSuccess(null); }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${activeTab === "password"
                      ? "bg-orange-50 text-orange-600 border border-orange-200 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                  >
                    <span>🔑</span> Change Password
                  </button>
                </div>

                {/* Notifications */}
                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                    <span>⚠️</span> {error}
                  </div>
                )}
                {success && (
                  <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2">
                    <span>✅</span> {success}
                  </div>
                )}

                {/* Profile Form */}
                {activeTab === "profile" && (
                  <form onSubmit={handleSaveProfile} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                        <input
                          type="text"
                          value={profileData.name}
                          onChange={(e) => handleProfileInputChange("name", e.target.value)}
                          placeholder="Enter your full name"
                          required
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                        <input
                          type="email"
                          value={profileData.email}
                          placeholder="Enter your email"
                          required
                          readOnly
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold cursor-not-allowed"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">Email address cannot be changed directly</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                        <input
                          type="text"
                          value={profileData.designation}
                          onChange={(e) => handleProfileInputChange("designation", e.target.value)}
                          placeholder="e.g. Senior Software Engineer"
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Phone / Contact Number</label>
                        <input
                          type="tel"
                          value={profileData.phoneNumber}
                          onChange={(e) => handleProfileInputChange("phoneNumber", e.target.value)}
                          placeholder="e.g. +91 9876543210"
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Date of Birth</label>
                        <input
                          type="date"
                          value={profileData.dob}
                          onChange={(e) => handleProfileInputChange("dob", e.target.value)}
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                        <select
                          value={profileData.gender}
                          onChange={(e) => handleProfileInputChange("gender", e.target.value)}
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        >
                          <option value="">Select Gender</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Work Location</label>
                        <select
                          value={profileData.workLocation}
                          onChange={(e) => handleProfileInputChange("workLocation", e.target.value)}
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        >
                          <option value="OFFICE">Office</option>
                          <option value="REMOTE">Remote</option>
                          <option value="HYBRID">Hybrid</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Employment Type</label>
                        <select
                          value={profileData.employmentType}
                          onChange={(e) => handleProfileInputChange("employmentType", e.target.value)}
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        >
                          <option value="FULL_TIME">Full Time</option>
                          <option value="PART_TIME">Part Time</option>
                          <option value="CONTRACT">Contract</option>
                          <option value="INTERN">Intern</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Residential Address</label>
                      <textarea
                        rows={2}
                        value={profileData.address}
                        onChange={(e) => handleProfileInputChange("address", e.target.value)}
                        placeholder="Enter your residential address..."
                        className="w-full p-3 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoadingProfile}
                        className="px-6 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isLoadingProfile ? "Saving Profile..." : "Save Changes"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Password Form */}
                {activeTab === "password" && (
                  <form onSubmit={handleSavePassword} className="space-y-5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Current Password</label>
                      <div className="relative">
                        <input
                          type={showCurrentPassword ? "text" : "password"}
                          value={passwordData.currentPassword}
                          onChange={(e) => handlePasswordInputChange("currentPassword", e.target.value)}
                          placeholder="Enter your current account password"
                          required
                          className="w-full h-10 pl-3.5 pr-10 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 text-xs font-bold"
                        >
                          {showCurrentPassword ? "Hide" : "Show"}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            value={passwordData.newPassword}
                            onChange={(e) => handlePasswordInputChange("newPassword", e.target.value)}
                            placeholder="Minimum 8 characters"
                            required
                            className="w-full h-10 pl-3.5 pr-10 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 text-xs font-bold"
                          >
                            {showNewPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</label>
                        <input
                          type="password"
                          value={passwordData.confirmPassword}
                          onChange={(e) => handlePasswordInputChange("confirmPassword", e.target.value)}
                          placeholder="Re-enter new password"
                          required
                          className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoadingPassword}
                        className="px-6 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isLoadingPassword ? "Updating Password..." : "Update Password"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {showApplyModal && (
        <ApplyLeaveModal
          leaveTypes={leaveTypes}
          onClose={() => setShowApplyModal(false)}
          onSubmitted={fetchProfileLeaveData}
        />
      )}
    </main>
  );
}