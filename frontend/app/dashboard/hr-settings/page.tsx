"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";

type HRSetting = {
  id: number;
  category: string;
  key: string;
  value: string;
  status: boolean;
};

type LeaveType = {
  id: number;
  name: string;
  daysAllowed: number;
  description: string | null;
  status: boolean;
};

type EmployeeUser = {
  id: number;
  name: string;
  email: string;
  designation: string | { name: string } | null;
};

type LeaveBalance = {
  id: number;
  userId: number;
  leaveTypeId: number;
  allocated: number;
  used: number;
  remaining: number;
  year: number;
  leaveType: LeaveType;
  user: EmployeeUser;
};

const getDesignationName = (des: any): string => {
  if (!des) return "Employee";
  if (typeof des === "string") return des;
  if (typeof des === "object" && des.name) return String(des.name);
  return "Employee";
};

const getLeaveTypeName = (leaveType: any): string => {
  if (!leaveType) return "Leave";
  if (typeof leaveType === "string") return leaveType;
  if (typeof leaveType === "object" && leaveType.name) return String(leaveType.name);
  return "Leave";
};

export default function HRSettingsPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [settings, setSettings] = useState<HRSetting[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("EMPLOYMENT_TYPE");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Form states for HR Setting options
  const [newKey, setNewKey] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Edit HR Setting Option modal/state
  const [editingSetting, setEditingSetting] = useState<HRSetting | null>(null);
  const [editKey, setEditKey] = useState<string>("");
  const [editValue, setEditValue] = useState<string>("");

  // Leave Types State
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loadingLeaveTypes, setLoadingLeaveTypes] = useState<boolean>(false);
  const [newLTName, setNewLTName] = useState<string>("");
  const [newLTDays, setNewLTDays] = useState<string>("12");
  const [newLTDesc, setNewLTDesc] = useState<string>("");
  const [submittingLT, setSubmittingLT] = useState<boolean>(false);
  const [editingLT, setEditingLT] = useState<LeaveType | null>(null);
  const [editLTName, setEditLTName] = useState<string>("");
  const [editLTDays, setEditLTDays] = useState<string>("");
  const [editLTDesc, setEditLTDesc] = useState<string>("");

  // Employee Leave Balances State
  const [empUsers, setEmpUsers] = useState<EmployeeUser[]>([]);
  const [allBalances, setAllBalances] = useState<LeaveBalance[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [empSearchQuery, setEmpSearchQuery] = useState<string>("");
  const [loadingBalances, setLoadingBalances] = useState<boolean>(false);
  const [editingBalanceId, setEditingBalanceId] = useState<number | null>(null);
  const [editAllocated, setEditAllocated] = useState<string>("");
  const [editUsed, setEditUsed] = useState<string>("");
  const [editRemaining, setEditRemaining] = useState<string>("");
  const [updatingBalance, setUpdatingBalance] = useState<boolean>(false);

  const categories = [
    { key: "EMPLOYMENT_TYPE", label: "Employment Types" },
    { key: "WORK_LOCATION", label: "Work Locations" },
    { key: "SHIFT_TYPE", label: "Shift Schedules" },
    { key: "LEAVE_CATEGORY", label: "Leave Categories" },
    { key: "LEAVE_TYPES_MGMT", label: "System Leave Types (Comp Off & Rules)" },
    { key: "EMP_LEAVE_BALANCES", label: "Employee Leave Balances Editor" },
  ];

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
      return;
    }
    if (session?.user) {
      const roleName = typeof session.user.role === "string" ? session.user.role : (session.user.role as any)?.name || "";
      const isSuperAdmin = roleName === "SUPER_ADMIN" || (session.user.role as any) === 1;
      const isAdmin = roleName === "ADMIN" || (session.user.role as any) === 2;
      const isHR = roleName.includes("HR") || roleName.includes("MANAGER");

      if (!isSuperAdmin && !isAdmin && !isHR) {
        alert("Access Denied: HRMS Settings page is restricted to HR Administrators.");
        router.replace("/dashboard");
      }
    }
  }, [isLoading, router, session]);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`http://localhost:5000/api/hr-settings?category=${activeCategory}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch HR settings");
      const data = await res.json();
      setSettings(data.settings || []);
    } catch (err: any) {
      setError(err.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaveTypes = async () => {
    setLoadingLeaveTypes(true);
    try {
      const token = getAuthToken();
      const res = await fetch("http://localhost:5000/api/leaves/types", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeaveTypes(data.types || []);
      }
    } catch (err) {
      console.error("Fetch leave types error:", err);
    } finally {
      setLoadingLeaveTypes(false);
    }
  };

  const fetchEmployeeBalances = async () => {
    setLoadingBalances(true);
    try {
      const token = getAuthToken();
      const res = await fetch("http://localhost:5000/api/leaves/admin/balances", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmpUsers(data.users || []);
        setAllBalances(data.balances || []);
        if (data.users?.length > 0 && !selectedEmpId) {
          setSelectedEmpId(String(data.users[0].id));
        }
      }
    } catch (err) {
      console.error("Fetch employee balances error:", err);
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => {
    if (session?.token) {
      if (activeCategory === "LEAVE_TYPES_MGMT") {
        fetchLeaveTypes();
      } else if (activeCategory === "EMP_LEAVE_BALANCES") {
        fetchEmployeeBalances();
      } else {
        fetchSettings();
      }
    }
  }, [activeCategory, session?.token]);

  // Handle HR Setting Option Creation
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;

    setSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch("http://localhost:5000/api/hr-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category: activeCategory,
          key: newKey.trim(),
          value: newValue.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create setting");
      }

      setNewKey("");
      setNewValue("");
      fetchSettings();
    } catch (err: any) {
      alert(err.message || "Error creating setting");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle HR Setting Option Update
  const handleUpdateSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSetting || !editKey.trim() || !editValue.trim()) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`http://localhost:5000/api/hr-settings/${editingSetting.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          key: editKey.trim(),
          value: editValue.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to update setting");
      }

      setEditingSetting(null);
      fetchSettings();
    } catch (err: any) {
      alert(err.message || "Error updating setting");
    }
  };

  // Handle HR Setting Option Delete
  const handleDeleteSetting = async (id: number, valName: string) => {
    if (!confirm(`Are you sure you want to delete "${valName}"?`)) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`http://localhost:5000/api/hr-settings/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to delete setting");
      }

      fetchSettings();
    } catch (err: any) {
      alert(err.message || "Error deleting setting");
    }
  };

  // Handle Create Leave Type
  const handleCreateLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLTName.trim() || !newLTDays) return;

    setSubmittingLT(true);
    try {
      const token = getAuthToken();
      const res = await fetch("http://localhost:5000/api/leaves/types", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newLTName.trim(),
          daysAllowed: Number(newLTDays),
          description: newLTDesc.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create leave type");
      }

      setNewLTName("");
      setNewLTDays("12");
      setNewLTDesc("");
      fetchLeaveTypes();
    } catch (err: any) {
      alert(err.message || "Error creating leave type");
    } finally {
      setSubmittingLT(false);
    }
  };

  // Handle Update Leave Type
  const handleUpdateLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLT || !editLTName.trim() || !editLTDays) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`http://localhost:5000/api/leaves/types/${editingLT.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editLTName.trim(),
          daysAllowed: Number(editLTDays),
          description: editLTDesc.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to update leave type");
      }

      setEditingLT(null);
      fetchLeaveTypes();
    } catch (err: any) {
      alert(err.message || "Error updating leave type");
    }
  };

  // Handle Delete Leave Type
  const handleDeleteLeaveType = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to deactivate leave type "${name}"?`)) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`http://localhost:5000/api/leaves/types/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to delete leave type");
      }

      fetchLeaveTypes();
    } catch (err: any) {
      alert(err.message || "Error deleting leave type");
    }
  };

  // Handle Save Employee Leave Balance
  const handleSaveEmployeeBalance = async (balanceId: number) => {
    setUpdatingBalance(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`http://localhost:5000/api/leaves/admin/balances/${balanceId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          allocated: Number(editAllocated),
          used: Number(editUsed),
          remaining: Number(editRemaining),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to update balance");
      }

      alert("Employee leave balance updated successfully!");
      setEditingBalanceId(null);
      fetchEmployeeBalances();
    } catch (err: any) {
      alert(err.message || "Error updating balance");
    } finally {
      setUpdatingBalance(false);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading settings...</main>;
  }

  const roleName = typeof session.user?.role === "string" ? session.user.role : (session.user?.role as any)?.name || "";
  const isSuperAdmin = roleName === "SUPER_ADMIN" || (session.user?.role as any) === 1;

  const filteredUsers = empUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(empSearchQuery.toLowerCase())
  );

  const selectedUserBalances = allBalances.filter((b) => String(b.userId) === selectedEmpId);
  const selectedUserObj = empUsers.find((u) => String(u.id) === selectedEmpId);

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={isSuperAdmin} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Back button */}
          <button
            onClick={() => router.push("/dashboard")}
            className="back-button mb-4 text-xs font-bold text-orange-600 flex items-center gap-1 cursor-pointer"
          >
            ← Back
          </button>

          {/* Header */}
          <div className="welcome mb-6">
            <p className="eyebrow">HR MANAGEMENT</p>
            <h1 className="text-2xl font-black text-slate-900">Settings & Policy Controls</h1>
            <p className="text-xs text-slate-500 font-medium">
              Configure system dropdown options, Leave Types (Comp Off, Sick, Paid), and adjust individual employee leave balances.
            </p>
          </div>

          {/* Monthly Paid Leave Criteria Config Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-md mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1 max-w-lg">
              <span className="px-2.5 py-0.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-[10px] font-extrabold uppercase tracking-wider">
                Leave Policy Criteria
              </span>
              <h2 className="text-lg font-black text-white">Monthly Paid Leave Allowance</h2>
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                Set default paid leave days credited per employee per month. Current criteria grants <strong className="text-orange-400 font-black">1.5 days/month</strong> (18 days annual allocation).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700 w-full md:w-auto">
              <span className="text-xs font-bold text-slate-300">Days / Month:</span>
              {[1.0, 1.5, 2.0, 2.5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={async () => {
                    try {
                      const token = getAuthToken();
                      await fetch("http://localhost:5000/api/hr-settings", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          category: "LEAVE_CRITERIA",
                          key: "MONTHLY_PAID_LEAVE_DAYS",
                          value: String(val),
                        }),
                      });
                      alert(`Monthly Paid Leave Allowance updated to ${val} days/month (${val * 12} days/year)!`);
                      fetchSettings();
                    } catch (err: any) {
                      alert(err.message || "Failed to update criteria");
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-xs transition-all cursor-pointer"
                >
                  {val} Day{val > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 mb-6">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${activeCategory === cat.key
                  ? "bg-orange-500 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* TAB 1,2,3,4: DYNAMIC OPTIONS (Employment Types, Work Locations, Shift Schedules, Leave Categories) */}
          {!["LEAVE_TYPES_MGMT", "EMP_LEAVE_BALANCES"].includes(activeCategory) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add New Setting Option Form */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h2 className="text-sm font-extrabold text-slate-900">Add New Option</h2>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Option Code / Key
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CONTRACT_REMOTE"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Display Name / Value
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Contract (Remote)"
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? "Adding..." : "Add Setting Option"}
                  </button>
                </form>
              </div>

              {/* Active Options Table (With Edit & Delete) */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-slate-900">Active Configured Options</h2>
                  <span className="text-xs font-semibold text-slate-400">{settings.length} items</span>
                </div>

                {loading ? (
                  <p className="text-xs text-slate-400 animate-pulse font-medium">Loading settings...</p>
                ) : error ? (
                  <p className="text-xs text-rose-500 font-semibold">{error}</p>
                ) : settings.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                    <p className="text-xs text-slate-400 font-medium">No options configured for this category yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                          <th className="py-3 px-4">Key Code</th>
                          <th className="py-3 px-4">Display Value</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {settings.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">
                              {item.key}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {item.value}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-0.5 text-[11px] font-extrabold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSetting(item);
                                    setEditKey(item.key);
                                    setEditValue(item.value);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSetting(item.id, item.value)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[11px] transition-colors cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: SYSTEM LEAVE TYPES MANAGEMENT (Comp Off, Casual, Sick, Earned, Unpaid) */}
          {activeCategory === "LEAVE_TYPES_MGMT" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add New Leave Type Form */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <h2 className="text-sm font-extrabold text-slate-900">Add System Leave Type</h2>
                <form onSubmit={handleCreateLeaveType} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Leave Type Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Compensatory Off, Maternity Leave"
                      value={newLTName}
                      onChange={(e) => setNewLTName(e.target.value)}
                      required
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Default Days Allowed / Year
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="e.g. 12"
                      value={newLTDays}
                      onChange={(e) => setNewLTDays(e.target.value)}
                      required
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Description (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Granted for overtime work or weekend shifts"
                      value={newLTDesc}
                      onChange={(e) => setNewLTDesc(e.target.value)}
                      className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingLT}
                    className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {submittingLT ? "Saving..." : "+ Create Leave Type"}
                  </button>
                </form>
              </div>

              {/* Leave Types List */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-slate-900">Active Leave Types List</h2>
                  <span className="text-xs font-semibold text-slate-400">{leaveTypes.length} configured</span>
                </div>

                {loadingLeaveTypes ? (
                  <p className="text-xs text-slate-400 animate-pulse font-medium">Loading leave types...</p>
                ) : leaveTypes.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium">No leave types available.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                          <th className="py-3 px-4">Leave Type</th>
                          <th className="py-3 px-4">Days / Year</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {leaveTypes.map((lt) => (
                          <tr key={lt.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-bold text-slate-900">
                              {lt.name}
                              {lt.name.toLowerCase().includes("comp") && (
                                <span className="ml-2 px-2 py-0.5 text-[10px] font-black rounded-md bg-orange-100 text-orange-700">
                                  COMP OFF
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">
                              {lt.daysAllowed} Days
                            </td>
                            <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                              {lt.description || "N/A"}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLT(lt);
                                    setEditLTName(lt.name);
                                    setEditLTDays(String(lt.daysAllowed));
                                    setEditLTDesc(lt.description || "");
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLeaveType(lt.id, lt.name)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[11px] transition-colors cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: EMPLOYEE LEAVE BALANCES EDITOR */}
          {activeCategory === "EMP_LEAVE_BALANCES" && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-black text-slate-900">Employee Leave Balances Manager</h2>
                  <p className="text-xs text-slate-500 font-medium">Select an employee to adjust their allocated, used, or remaining leave balances.</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                  <input
                    type="text"
                    placeholder="Search employee name or email..."
                    value={empSearchQuery}
                    onChange={(e) => setEmpSearchQuery(e.target.value)}
                    className="h-10 px-3.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 w-full md:w-64"
                  />
                  <select
                    value={selectedEmpId}
                    onChange={(e) => setSelectedEmpId(e.target.value)}
                    className="h-10 px-3 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-700"
                  >
                    <option value="">Select Employee</option>
                    {filteredUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loadingBalances ? (
                <p className="text-xs text-slate-400 animate-pulse font-medium">Loading employee leave balances...</p>
              ) : !selectedUserObj ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
                  <p className="text-xs text-slate-400 font-medium">Please select an employee from the dropdown above to view and edit their leave balances.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Selected User Header */}
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{selectedUserObj.name}</h3>
                      <p className="text-xs text-slate-500 font-medium">{selectedUserObj.email} • {getDesignationName(selectedUserObj.designation)}</p>
                    </div>
                    <span className="px-3 py-1 bg-orange-100 text-orange-700 border border-orange-200 rounded-full text-xs font-black">
                      Year {new Date().getFullYear()}
                    </span>
                  </div>

                  {/* Balances Grid Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                          <th className="py-3 px-4">Leave Type</th>
                          <th className="py-3 px-4">Allocated Days</th>
                          <th className="py-3 px-4">Used Days</th>
                          <th className="py-3 px-4">Remaining Days</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedUserBalances.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                              No leave balances found for this employee.
                            </td>
                          </tr>
                        ) : (
                          selectedUserBalances.map((bal) => {
                            const isEditingThis = editingBalanceId === bal.id;

                            return (
                              <tr key={bal.id} className="hover:bg-slate-50/80">
                                <td className="py-3 px-4 font-extrabold text-slate-900">
                                  {getLeaveTypeName(bal.leaveType)}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-slate-700">
                                  {isEditingThis ? (
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={editAllocated}
                                      onChange={(e) => setEditAllocated(e.target.value)}
                                      className="w-20 h-8 px-2 border border-slate-300 rounded-lg text-xs font-bold"
                                    />
                                  ) : (
                                    `${bal.allocated} Days`
                                  )}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-amber-600">
                                  {isEditingThis ? (
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={editUsed}
                                      onChange={(e) => setEditUsed(e.target.value)}
                                      className="w-20 h-8 px-2 border border-slate-300 rounded-lg text-xs font-bold"
                                    />
                                  ) : (
                                    `${bal.used} Days`
                                  )}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                                  {isEditingThis ? (
                                    <input
                                      type="number"
                                      step="0.5"
                                      value={editRemaining}
                                      onChange={(e) => setEditRemaining(e.target.value)}
                                      className="w-20 h-8 px-2 border border-slate-300 rounded-lg text-xs font-bold"
                                    />
                                  ) : (
                                    `${bal.remaining} Days`
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {isEditingThis ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingBalanceId(null)}
                                        className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 font-bold text-[11px]"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        disabled={updatingBalance}
                                        onClick={() => handleSaveEmployeeBalance(bal.id)}
                                        className="px-3 py-1 rounded-lg bg-orange-500 text-white font-extrabold text-[11px] shadow-xs hover:bg-orange-600 disabled:opacity-50"
                                      >
                                        {updatingBalance ? "Saving..." : "Save"}
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingBalanceId(bal.id);
                                        setEditAllocated(String(bal.allocated));
                                        setEditUsed(String(bal.used));
                                        setEditRemaining(String(bal.remaining));
                                      }}
                                      className="px-3 py-1 rounded-lg bg-slate-900 text-white font-extrabold text-[11px] hover:bg-slate-800 transition-all cursor-pointer"
                                    >
                                      Edit Balance
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Edit HR Setting Option Modal */}
      {editingSetting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-900">Edit Configured Option</h3>
            <form onSubmit={handleUpdateSetting} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Key Code
                </label>
                <input
                  type="text"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Display Value
                </label>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSetting(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Leave Type Modal */}
      {editingLT && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-900">Edit System Leave Type</h3>
            <form onSubmit={handleUpdateLeaveType} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Leave Type Name
                </label>
                <input
                  type="text"
                  value={editLTName}
                  onChange={(e) => setEditLTName(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Days Allowed / Year
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editLTDays}
                  onChange={(e) => setEditLTDays(e.target.value)}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editLTDesc}
                  onChange={(e) => setEditLTDesc(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingLT(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-xs"
                >
                  Update Leave Type
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
