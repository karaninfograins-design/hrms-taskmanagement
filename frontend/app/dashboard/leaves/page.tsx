"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Check, X, RefreshCw, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";
import { buildApiUrl } from "@/lib/api-config";
import { ApplyLeaveModal } from "@/components/leaves/ApplyLeaveModal";

type LeaveType = {
  id: number;
  name: string;
  daysAllowed: number;
  description: string | null;
};

type LeaveBalance = {
  id: number;
  allocated: number;
  used: number;
  remaining: number;
  leaveType: LeaveType;
};

type LeaveRequest = {
  id: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  halfDayPeriod: "FIRST_HALF" | "SECOND_HALF" | null;
  reason: string;
  status: string;
  userId?: number;
  createdAt?: string;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  user: {
    id?: number;
    name: string;
    email: string;
    designation?: { name: string } | null;
    department?: { name: string } | null;
    employeeProfile?: {
      employeeCode?: string;
      employeeId?: string;
      designation?: string;
      department?: { name: string } | null;
    } | null;
  };
  leaveType: LeaveType;
  approvedBy?: {
    id?: number;
    name: string;
  };
};

export default function LeavesPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRequest | null>(null);
  const [viewingLeave, setViewingLeave] = useState<LeaveRequest | null>(null);
  const [viewingBalances, setViewingBalances] = useState<LeaveBalance[]>([]);
  const [loadingViewingBalances, setLoadingViewingBalances] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [rejectionModalId, setRejectionModalId] = useState<number | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>("");
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();

      const [typesRes, balancesRes, requestsRes] = await Promise.all([
        fetch(buildApiUrl("/api/leaves/types"), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(buildApiUrl("/api/leaves/balances"), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(buildApiUrl("/api/leaves/requests?limit=200"), { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (typesRes.ok) {
        const typesData = await typesRes.json();
        setLeaveTypes(typesData.types || []);
      }

      if (balancesRes.ok) {
        const balData = await balancesRes.json();
        setBalances(balData.balances || []);
      }

      if (requestsRes.ok) {
        const reqData = await requestsRes.json();
        setRequests(reqData.requests || []);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load leave data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.token) {
      fetchData();
    }
  }, [session?.token]);

  // Keep pagination within valid range when data or filters change
  useEffect(() => {
    const filteredCount = requests.filter((r) => {
      if (statusFilter === "ALL") return true;
      return r.status === statusFilter;
    }).length;
    const maxPages = Math.max(1, Math.ceil(filteredCount / pageSize));
    if (currentPage > maxPages) {
      setCurrentPage(maxPages);
    }
  }, [requests, statusFilter, pageSize, currentPage]);

  const handleAction = async (requestId: number, status: "APPROVED" | "REJECTED", rejectionReason?: string) => {
    try {
      setIsSubmittingAction(true);
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/api/leaves/requests/${requestId}/status`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status, rejectionReason }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || `Failed to ${status.toLowerCase()} leave`);
      }

      setRejectionModalId(null);
      setRejectionReasonInput("");
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleCancelRequest = async (requestId: number) => {
    if (!window.confirm("Are you sure you want to cancel this leave request?")) {
      return;
    }
    try {
      setIsSubmittingAction(true);
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/api/leaves/requests/${requestId}`), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to cancel leave request");
      }

      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to cancel leave request");
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleOpenViewModal = async (req: LeaveRequest) => {
    setViewingLeave(req);
    const targetUserId = req.userId || req.user?.id;

    if (!targetUserId || targetUserId === session?.user?.id) {
      setViewingBalances(balances);
      return;
    }

    setLoadingViewingBalances(true);
    try {
      const token = getAuthToken();
      const res = await fetch(buildApiUrl(`/api/leaves/balances?userId=${targetUserId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setViewingBalances(data.balances || []);
      } else {
        setViewingBalances([]);
      }
    } catch (e) {
      console.warn("Failed to fetch employee balances for view modal:", e);
      setViewingBalances([]);
    } finally {
      setLoadingViewingBalances(false);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading leave management...</main>;
  }

  const roleName = (typeof session.user?.role === "string" ? session.user.role : (session.user?.role as any)?.name || "").toUpperCase();
  const userRoleId = typeof session.user?.role === "number" ? session.user.role : (session.user?.role as any)?.id;
  const designationName = ((session.user as any)?.designation?.name || (session.user as any)?.designation || "").toUpperCase();
  const userEmail = (session.user?.email || "").toLowerCase();
  const isSuperAdmin = roleName === "SUPER_ADMIN" || userRoleId === 1;
  const isHR = roleName.includes("HR") || roleName.includes("ADMIN") || designationName.includes("HR") || userEmail.includes("hr@") || isSuperAdmin || userRoleId === 1 || userRoleId === 2 || userRoleId === 3;

  const getLeaveTypeName = (leaveType: any): string => {
    if (!leaveType) return "Leave";
    if (typeof leaveType === "string") return leaveType;
    if (typeof leaveType === "object" && leaveType.name) return String(leaveType.name);
    return "Leave";
  };

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={isSuperAdmin} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 welcome mb-6">
            <div>
              <p className="eyebrow">LEAVE MANAGEMENT</p>
              <h3 className="text-2xl font-black text-slate-900">Leave Requests & Balances</h3>
              <p className="text-xs text-slate-500 font-medium">
                Track leave balances, apply for leave, and manage leave approval workflows.
              </p>
            </div>
            {!isSuperAdmin && (
              <button
                onClick={() => {
                  setEditingLeave(null);
                  setShowApplyModal(true);
                }}
                className="w-full sm:w-auto text-center justify-center px-4 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-extrabold rounded-xl transition-all shadow-xs text-xs cursor-pointer"
              >
                + Apply For Leave
              </button>
            )}
          </div>

          {/* Summary Metric Cards - ONLY 4 Cards: Total, Pending, Approved, Rejected */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {/* Metric Card: Total */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 transition-all hover:shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-black text-lg shrink-0">
                📋
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Requests</p>
                <h3 className="text-xl font-black text-slate-900 leading-tight">{requests.length}</h3>
                <span className="text-[10px] text-slate-500 font-medium">
                  {isHR ? "All employee requests" : "Your submitted requests"}
                </span>
              </div>
            </div>

            {/* Metric Card: Pending */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 transition-all hover:shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-black text-lg shrink-0">
                ⏳
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Pending</p>
                <h3 className="text-xl font-black text-slate-900 leading-tight">
                  {requests.filter((r) => r.status === "PENDING").length}
                </h3>
                <span className="text-[10px] text-amber-600 font-bold">
                  {isHR ? "Awaiting your decision" : "Awaiting HR review"}
                </span>
              </div>
            </div>

            {/* Metric Card: Approved */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 transition-all hover:shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-black text-lg shrink-0">
                ✅
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Approved</p>
                <h3 className="text-xl font-black text-slate-900 leading-tight">
                  {requests.filter((r) => r.status === "APPROVED").length}
                </h3>
                <span className="text-[10px] text-emerald-600 font-bold">
                  {isHR ? "Approved applications" : "Your approved leaves"}
                </span>
              </div>
            </div>

            {/* Metric Card: Rejected */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 transition-all hover:shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-black text-lg shrink-0">
                ❌
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Rejected</p>
                <h3 className="text-xl font-black text-slate-900 leading-tight">
                  {requests.filter((r) => r.status === "REJECTED").length}
                </h3>
                <span className="text-[10px] text-rose-600 font-bold">
                  {isHR ? "Rejected applications" : "Your rejected leaves"}
                </span>
              </div>
            </div>
          </div>

          {/* Leave Requests & Approvals Section */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  {isHR ? "Leave Requests & Approvals" : "My Leave Applications & Status"}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {isHR
                    ? "Manage, review, approve, or reject employee leave requests."
                    : "View the status of your submitted leave applications."}
                </p>
              </div>

              {/* Status Filter Tabs & Refresh Button */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchData()}
                  disabled={loading}
                  className="h-8 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 flex items-center gap-1.5 shadow-2xs active:scale-95 disabled:opacity-50"
                  title="Refresh leave requests"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("ALL");
                      setCurrentPage(1);
                    }}
                    className={`h-7 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${statusFilter === "ALL"
                      ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-xs font-extrabold"
                      : "text-slate-600 hover:text-orange-600 hover:bg-orange-50/70"
                      }`}
                  >
                    <span>All</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${statusFilter === "ALL" ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"}`}>
                      {requests.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("PENDING");
                      setCurrentPage(1);
                    }}
                    className={`h-7 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${statusFilter === "PENDING"
                      ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-xs font-extrabold"
                      : "text-slate-600 hover:text-orange-600 hover:bg-orange-50/70"
                      }`}
                  >
                    <span>Pending</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${statusFilter === "PENDING" ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"}`}>
                      {requests.filter((r) => r.status === "PENDING").length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("APPROVED");
                      setCurrentPage(1);
                    }}
                    className={`h-7 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${statusFilter === "APPROVED"
                      ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-xs font-extrabold"
                      : "text-slate-600 hover:text-orange-600 hover:bg-orange-50/70"
                      }`}
                  >
                    <span>Approved</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${statusFilter === "APPROVED" ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"}`}>
                      {requests.filter((r) => r.status === "APPROVED").length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("REJECTED");
                      setCurrentPage(1);
                    }}
                    className={`h-7 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${statusFilter === "REJECTED"
                      ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-xs font-extrabold"
                      : "text-slate-600 hover:text-orange-600 hover:bg-orange-50/70"
                      }`}
                  >
                    <span>Rejected</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${statusFilter === "REJECTED" ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"}`}>
                      {requests.filter((r) => r.status === "REJECTED").length}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <p className="text-xs text-slate-400 animate-pulse font-medium py-6 text-center">Loading leave records...</p>
            ) : error ? (
              <p className="text-xs text-rose-500 font-semibold py-4 text-center">{error}</p>
            ) : requests.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <span className="text-2xl mb-1 block">🌴</span>
                <p className="text-xs text-slate-600 font-bold">No leave applications found.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isHR ? "No employees have submitted leave requests yet." : "You have not submitted any leave requests yet."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full min-w-[700px] text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Leave Type</th>
                      <th className="py-3 px-4">Dates & Duration</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Status & Decision</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(() => {
                      const displayRequests = requests.filter((r) => {
                        if (statusFilter === "ALL") return true;
                        return r.status === statusFilter;
                      });

                      if (displayRequests.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                              No leave requests found in this category.
                            </td>
                          </tr>
                        );
                      }

                      const totalPages = Math.max(1, Math.ceil(displayRequests.length / pageSize));
                      const safePage = Math.min(currentPage, totalPages);
                      const startIndex = (safePage - 1) * pageSize;
                      const paginatedRequests = displayRequests.slice(startIndex, startIndex + pageSize);

                      return paginatedRequests.map((req) => {
                        const isRequester =
                          req.user?.email === session.user?.email ||
                          (req as any).userId === session.user?.id;
                        const canModify = req.status === "PENDING" && (isRequester || isHR);

                        return (
                          <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col">
                                <span className="font-extrabold text-slate-900 text-xs">{req.user?.name || "Self"}</span>
                                <span className="text-[10px] text-slate-400 font-medium">{req.user?.email || ""}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg text-xs">
                                {getLeaveTypeName(req.leaveType)}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-700">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 text-xs">
                                  {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="font-black text-orange-600 text-[11px]">
                                    {Number(req.totalDays).toLocaleString(undefined, { maximumFractionDigits: 1 })} day(s)
                                  </span>
                                  {req.halfDayPeriod && (
                                    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[9px] font-bold text-orange-700 border border-orange-200">
                                      {req.halfDayPeriod === "FIRST_HALF" ? "First half" : "Second half"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate text-xs" title={req.reason}>
                              {req.reason}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-col gap-1 items-start">
                                <span
                                  className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full ${req.status === "APPROVED"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : req.status === "REJECTED"
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : "bg-amber-50 text-amber-700 border border-amber-200"
                                    }`}
                                >
                                  {req.status === "APPROVED" && "✓ "}
                                  {req.status === "REJECTED" && "✕ "}
                                  {req.status === "PENDING" && "⏳ "}
                                  {req.status}
                                </span>
                                {req.approvedBy && (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    By {req.approvedBy.name}
                                  </span>
                                )}
                                {(req as any).rejectionReason && (
                                  <span className="text-[10px] text-rose-600 font-semibold max-w-[200px] truncate" title={(req as any).rejectionReason}>
                                    Reason: {(req as any).rejectionReason}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {req.status === "PENDING" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenViewModal(req)}
                                      className="h-8 px-2.5 bg-white hover:bg-slate-100 text-slate-700 active:scale-95 font-bold text-xs rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                      title="View details and balances"
                                    >
                                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                                      <span>View</span>
                                    </button>

                                    {canModify && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingLeave(req);
                                            setShowApplyModal(true);
                                          }}
                                          className="h-8 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 font-bold text-xs rounded-lg border border-slate-200 transition-all cursor-pointer flex items-center gap-1"
                                          title="Edit leave request dates and reason"
                                        >
                                          <Pencil className="w-3 h-3 text-slate-500" />
                                          <span>Edit</span>
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isSubmittingAction}
                                          onClick={() => handleCancelRequest(req.id)}
                                          className="h-8 px-2.5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 active:scale-95 font-bold text-xs rounded-lg border border-slate-200 hover:border-rose-200 transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                          title="Cancel this leave request"
                                        >
                                          <X className="w-3.5 h-3.5 text-slate-400" />
                                          <span>Cancel</span>
                                        </button>
                                      </>
                                    )}

                                    {isHR && (
                                      <>
                                        <button
                                          type="button"
                                          disabled={isSubmittingAction}
                                          onClick={() => handleAction(req.id, "APPROVED")}
                                          className="h-8 px-3 bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white font-bold text-xs rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                          title="Approve this leave request"
                                        >
                                          <Check className="w-3.5 h-3.5 text-white" />
                                          <span>Approve</span>
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isSubmittingAction}
                                          onClick={() => {
                                            setRejectionModalId(req.id);
                                            setRejectionReasonInput("");
                                          }}
                                          className="h-8 px-2.5 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-slate-200 hover:border-rose-200 active:scale-95 font-bold text-xs rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                          title="Reject this leave request"
                                        >
                                          <X className="w-3.5 h-3.5 text-rose-600" />
                                          <span>Reject</span>
                                        </button>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenViewModal(req)}
                                    className="h-8 px-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 active:scale-95 font-bold text-xs rounded-lg border border-slate-200 hover:border-slate-300 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                    title="View leave details and balance history"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                                    <span>View </span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
                {(() => {
                  const displayRequests = requests.filter((r) => {
                    if (statusFilter === "ALL") return true;
                    return r.status === statusFilter;
                  });
                  const totalCount = displayRequests.length;
                  if (totalCount === 0) return null;

                  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
                  const safePage = Math.min(currentPage, totalPages);
                  const startIndex = (safePage - 1) * pageSize;

                  return (
                    <div className="bg-slate-50/70 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs font-medium text-slate-500">
                        Showing{" "}
                        <span className="font-bold text-slate-800">
                          {startIndex + 1}
                        </span>{" "}
                        to{" "}
                        <span className="font-bold text-slate-800">
                          {Math.min(startIndex + pageSize, totalCount)}
                        </span>{" "}
                        of <span className="font-bold text-slate-800">{totalCount}</span> leave applications
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
                          <span>Rows:</span>
                          <select
                            value={pageSize}
                            onChange={(e) => {
                              setPageSize(Number(e.target.value));
                              setCurrentPage(1);
                            }}
                            className="h-7 px-2 rounded-lg border border-slate-200 text-xs font-bold bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500/20 cursor-pointer"
                          >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                          >
                            ← Prev
                          </button>

                          <span className="text-xs font-black text-slate-700 px-1">
                            Page {safePage} of {totalPages}
                          </span>

                          <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs disabled:opacity-40 disabled:hover:bg-white transition-all cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* View Leave Details & History Modal */}
          {viewingLeave && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
              <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between border-b border-slate-700">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center font-black text-sm">
                      {viewingLeave.user?.name ? viewingLeave.user.name.slice(0, 2).toUpperCase() : "LV"}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-white leading-tight">
                        Leave Request Details
                      </h3>
                      <p className="text-xs text-slate-300 font-medium">
                        {viewingLeave.user?.name || "Employee"} •{" "}
                        <span className="text-orange-400 font-semibold">
                          {viewingLeave.user?.employeeProfile?.employeeCode || viewingLeave.user?.employeeProfile?.employeeId || `#${viewingLeave.userId || viewingLeave.user?.id || viewingLeave.id}`}
                        </span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewingLeave(null)}
                    className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center font-bold text-sm transition-all cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Scrollable Body */}
                <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 [scrollbar-width:thin]">
                  {/* Employee Info Header Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-slate-900">{viewingLeave.user?.name}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                          {viewingLeave.user?.employeeProfile?.employeeCode || viewingLeave.user?.employeeProfile?.employeeId || `ID #${viewingLeave.userId || viewingLeave.user?.id || viewingLeave.id}`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{viewingLeave.user?.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Designation</div>
                        <div className="text-xs font-bold text-slate-700">
                          {viewingLeave.user?.designation?.name || viewingLeave.user?.employeeProfile?.designation || "Employee"}
                        </div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Department</div>
                        <div className="text-xs font-bold text-slate-700">
                          {viewingLeave.user?.employeeProfile?.department?.name || viewingLeave.user?.department?.name || "General"}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Current Request Overview */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">
                          {getLeaveTypeName(viewingLeave.leaveType)}
                        </span>
                        {viewingLeave.halfDayPeriod && (
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700 border border-orange-200">
                            {viewingLeave.halfDayPeriod === "FIRST_HALF" ? "First half" : "Second half"}
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-3 py-1 text-xs font-extrabold rounded-full ${viewingLeave.status === "APPROVED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : viewingLeave.status === "REJECTED"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                      >
                        {viewingLeave.status === "APPROVED" && "✓ "}
                        {viewingLeave.status === "REJECTED" && "✕ "}
                        {viewingLeave.status === "PENDING" && "⏳ "}
                        {viewingLeave.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duration</div>
                        <div className="font-extrabold text-orange-600 mt-0.5">
                          {Number(viewingLeave.totalDays).toLocaleString(undefined, { maximumFractionDigits: 1 })} Day(s)
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leave Dates</div>
                        <div className="font-bold text-slate-800 mt-0.5">
                          {new Date(viewingLeave.startDate).toLocaleDateString()} - {new Date(viewingLeave.endDate).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Applied On</div>
                        <div className="font-semibold text-slate-600 mt-0.5">
                          {viewingLeave.createdAt ? new Date(viewingLeave.createdAt).toLocaleDateString() : "Recent"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Reason for Leave</div>
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-700 leading-relaxed italic">
                        "{viewingLeave.reason || "No reason provided"}"
                      </div>
                    </div>

                    {viewingLeave.approvedBy && (
                      <div className="text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2">
                        <span>✓</span>
                        <span>Approved by <strong className="font-bold">{viewingLeave.approvedBy.name}</strong></span>
                      </div>
                    )}

                    {viewingLeave.rejectionReason && (
                      <div className="text-xs text-rose-700 bg-rose-50/70 border border-rose-200 rounded-xl p-2.5 space-y-0.5">
                        <div className="font-bold">Rejection Note:</div>
                        <div className="italic">"{viewingLeave.rejectionReason}"</div>
                      </div>
                    )}
                  </div>

                  {/* Employee Leave Balance Section */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <span>📊</span> Employee Leave Balances
                      </h4>
                      <span className="text-[10px] font-semibold text-slate-400">Current Year Allocation</span>
                    </div>

                    {loadingViewingBalances ? (
                      <div className="py-4 text-center text-xs text-slate-400 font-medium animate-pulse">
                        Fetching leave balances...
                      </div>
                    ) : viewingBalances.length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400 italic">
                        No leave balance records found for this employee.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {viewingBalances.map((b) => {
                          const rem = Number(b.remaining) || 0;
                          const alloc = Number(b.allocated) || 0;
                          const percent = alloc > 0 ? Math.min(100, Math.max(0, (rem / alloc) * 100)) : 0;
                          return (
                            <div key={b.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold text-slate-800">{b.leaveType?.name || "Leave"}</span>
                                <span className="font-black text-slate-700 text-[11px]">
                                  {rem} / {alloc} left
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${percent > 50 ? "bg-emerald-500" : percent > 20 ? "bg-amber-500" : "bg-rose-500"}`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Employee Leave History Section with Invisible Scrolling */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-white shadow-2xs space-y-3">
                    {(() => {
                      const targetUserId = viewingLeave.userId || viewingLeave.user?.id;
                      const empHistory = requests.filter(
                        (r) => (r.userId || r.user?.id) === targetUserId
                      );

                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                              <span>🕒</span> Employee Leave History ({empHistory.length})
                            </h4>
                            <span className="text-[10px] font-semibold text-slate-400">Scrollable History</span>
                          </div>

                          {empHistory.length === 0 ? (
                            <div className="py-3 text-center text-xs text-slate-400 italic">
                              No leave history records found.
                            </div>
                          ) : (
                            <div className="max-h-56 sm:max-h-64 overflow-y-auto space-y-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-0.5">
                              {empHistory.map((hReq) => {
                                const isCurrent = hReq.id === viewingLeave.id;
                                return (
                                  <div
                                    key={hReq.id}
                                    className={`p-3 rounded-xl border text-xs transition-all ${isCurrent
                                      ? "bg-orange-50/70 border-orange-300 ring-1 ring-orange-200"
                                      : "bg-slate-50 border-slate-200 hover:bg-slate-100/70"
                                      }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-slate-800">
                                          {getLeaveTypeName(hReq.leaveType)}
                                        </span>
                                        {isCurrent && (
                                          <span className="text-[9px] font-extrabold uppercase bg-orange-600 text-white px-1.5 py-0.2 rounded-md">
                                            Current
                                          </span>
                                        )}
                                      </div>
                                      <span
                                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${hReq.status === "APPROVED"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : hReq.status === "REJECTED"
                                            ? "bg-rose-100 text-rose-800"
                                            : "bg-amber-100 text-amber-800"
                                          }`}
                                      >
                                        {hReq.status}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1">
                                      <span>
                                        {new Date(hReq.startDate).toLocaleDateString()} -{" "}
                                        {new Date(hReq.endDate).toLocaleDateString()} ({Number(hReq.totalDays)} days)
                                      </span>
                                      {hReq.createdAt && (
                                        <span className="text-[10px] text-slate-400">
                                          Applied: {new Date(hReq.createdAt).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                    {hReq.reason && (
                                      <p className="text-[11px] text-slate-500 mt-1 italic line-clamp-1">
                                        "{hReq.reason}"
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Modal Footer / Action Buttons */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setViewingLeave(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                  >
                    Close
                  </button>

                  <div className="flex items-center gap-2">
                    {viewingLeave.status === "PENDING" && (
                      <>
                        {/* If user is HR/Admin, show Approve & Reject */}
                        {isHR && (
                          <>
                            <button
                              type="button"
                              disabled={isSubmittingAction}
                              onClick={() => {
                                setRejectionModalId(viewingLeave.id);
                                setRejectionReasonInput("");
                                setViewingLeave(null);
                              }}
                              className="px-4 py-2 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                            >
                              ✕ Reject Request
                            </button>
                            <button
                              type="button"
                              disabled={isSubmittingAction}
                              onClick={async () => {
                                await handleAction(viewingLeave.id, "APPROVED");
                                setViewingLeave(null);
                              }}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                            >
                              ✓ Approve Request
                            </button>
                          </>
                        )}

                        {/* If user owns the request and it's pending, show Cancel */}
                        {(viewingLeave.userId || viewingLeave.user?.id) === session?.user?.id && (
                          <button
                            type="button"
                            disabled={isSubmittingAction}
                            onClick={async () => {
                              await handleCancelRequest(viewingLeave.id);
                              setViewingLeave(null);
                            }}
                            className="px-4 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            Cancel Application
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rejection Reason Modal */}
          {rejectionModalId !== null && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
              <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900">Provide Rejection Reason</h3>
                  <button
                    type="button"
                    onClick={() => setRejectionModalId(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Please specify why this leave request is being rejected. This explanation will be shared with the employee.
                </p>
                <textarea
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="e.g. Critical project deadline, please reschedule or adjust dates."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                />
                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setRejectionModalId(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingAction}
                    onClick={() => handleAction(rejectionModalId, "REJECTED", rejectionReasonInput)}
                    className="px-4 py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    Confirm Rejection
                  </button>
                </div>
              </div>
            </div>
          )}

          {showApplyModal && (
            <ApplyLeaveModal
              leaveTypes={leaveTypes}
              editingRequest={editingLeave}
              onClose={() => {
                setShowApplyModal(false);
                setEditingLeave(null);
              }}
              onSubmitted={fetchData}
            />
          )}
        </section>
      </div>
    </main>
  );
}
