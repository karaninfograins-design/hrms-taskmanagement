"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  user: {
    id?: number;
    name: string;
    email: string;
  };
  leaveType: LeaveType;
  approvedBy?: {
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

          {/* Summary Metric & Balance Cards - Single Row Layout */}
          <div className="flex items-center gap-4 overflow-x-auto pb-3 mb-6 no-scrollbar">
            {/* Metric Card: Total */}
            <div className="min-w-[200px] flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 shrink-0">
              <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 flex items-center justify-center font-black text-base shrink-0">
                📋
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Total Requests</p>
                <h3 className="text-lg font-black text-slate-900">{requests.length}</h3>
                <span className="text-[10px] text-slate-500 font-medium">Applications</span>
              </div>
            </div>

            {/* Metric Card: Pending */}
            <div className="min-w-[200px] flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 shrink-0">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-black text-base shrink-0">
                ⏳
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Pending</p>
                <h3 className="text-lg font-black text-slate-900">
                  {requests.filter((r) => r.status === "PENDING").length}
                </h3>
                <span className="text-[10px] text-amber-600 font-bold">Awaiting decision</span>
              </div>
            </div>

            {/* Metric Card: Approved */}
            <div className="min-w-[200px] flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 shrink-0">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-black text-base shrink-0">
                ✅
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Approved</p>
                <h3 className="text-lg font-black text-slate-900">
                  {requests.filter((r) => r.status === "APPROVED").length}
                </h3>
                <span className="text-[10px] text-emerald-600 font-bold">Approved</span>
              </div>
            </div>

            {/* Metric Card: Rejected */}
            <div className="min-w-[200px] flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5 shrink-0">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-black text-base shrink-0">
                ❌
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Rejected</p>
                <h3 className="text-lg font-black text-slate-900">
                  {requests.filter((r) => r.status === "REJECTED").length}
                </h3>
                <span className="text-[10px] text-rose-600 font-bold">Rejected</span>
              </div>
            </div>

            {/* Dynamic Leave Balance Cards */}
            {balances.map((bal) => (
              <div key={bal.id} className="min-w-[200px] flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between shrink-0 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    {getLeaveTypeName(bal.leaveType)}
                  </span>
                  <span className="text-[10px] text-orange-600 font-extrabold bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                    {bal.remaining}d Left
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-black text-slate-900">{bal.remaining}</span>
                  <span className="text-[11px] text-slate-400 font-semibold">/ {bal.allocated} days</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-orange-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (bal.remaining / (bal.allocated || 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
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
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fetchData()}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  title="Refresh leave requests"
                >
                  <span className={loading ? "animate-spin" : ""}>🔄</span>
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("ALL");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${statusFilter === "ALL"
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                >
                  All ({requests.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("PENDING");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${statusFilter === "PENDING"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60"
                    }`}
                >
                  <span>Pending</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${statusFilter === "PENDING" ? "bg-white/25 text-white" : "bg-amber-200/70 text-amber-900"
                      }`}
                  >
                    {requests.filter((r) => r.status === "PENDING").length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("APPROVED");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${statusFilter === "APPROVED"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60"
                    }`}
                >
                  Approved ({requests.filter((r) => r.status === "APPROVED").length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("REJECTED");
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${statusFilter === "REJECTED"
                      ? "bg-rose-600 text-white shadow-xs"
                      : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60"
                    }`}
                >
                  Rejected ({requests.filter((r) => r.status === "REJECTED").length})
                </button>
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
                            <td className="py-3.5 px-4 text-right">
                              {req.status === "PENDING" ? (
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  {canModify && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingLeave(req);
                                          setShowApplyModal(true);
                                        }}
                                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer flex items-center gap-1"
                                        title="Edit leave request dates and reason"
                                      >
                                        ✏️ Edit
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isSubmittingAction}
                                        onClick={() => handleCancelRequest(req.id)}
                                        className="px-2.5 py-1.5 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 active:scale-95 font-bold text-xs rounded-xl border border-slate-200 transition-all cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                        title="Cancel this leave request"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  )}

                                  {isHR && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isSubmittingAction}
                                        onClick={() => handleAction(req.id, "APPROVED")}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isSubmittingAction}
                                        onClick={() => {
                                          setRejectionModalId(req.id);
                                          setRejectionReasonInput("");
                                        }}
                                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 active:scale-95 font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 font-medium">
                                  Decision finalized
                                </span>
                              )}
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
