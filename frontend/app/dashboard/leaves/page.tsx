"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { getAuthToken } from "@/lib/auth";

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
  reason: string;
  status: string;
  user: {
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
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

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
        fetch("http://localhost:5000/api/leaves/types", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("http://localhost:5000/api/leaves/balances", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("http://localhost:5000/api/leaves/requests", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (typesRes.ok) {
        const typesData = await typesRes.json();
        setLeaveTypes(typesData.types || []);
        if (typesData.types?.length > 0) setSelectedTypeId(String(typesData.types[0].id));
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

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTypeId || !startDate || !endDate || !reason.trim()) return;

    setSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch("http://localhost:5000/api/leaves/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          leaveTypeId: Number(selectedTypeId),
          startDate,
          endDate,
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to submit leave request");
      }

      setShowApplyModal(false);
      setReason("");
      fetchData();
    } catch (err: any) {
      alert(err.message || "Error submitting leave request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (requestId: number, status: "APPROVED" | "REJECTED") => {
    try {
      const token = getAuthToken();
      const res = await fetch(`http://localhost:5000/api/leaves/requests/${requestId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || `Failed to ${status.toLowerCase()} leave`);
      }

      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading leave management...</main>;
  }

  const roleName = typeof session.user?.role === "string" ? session.user.role : (session.user?.role as any)?.name || "";
  const isSuperAdmin = roleName === "SUPER_ADMIN" || (session.user?.role as any) === 1;

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={isSuperAdmin} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Back Button */}
          <button
            onClick={() => router.push("/dashboard")}
            className="back-button mb-4 text-xs font-bold text-orange-600 flex items-center gap-1"
          >
            ← Back to Dashboard
          </button>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 welcome mb-6">
            <div>
              <p className="eyebrow">LEAVE MANAGEMENT</p>
              <h1 className="text-2xl font-black text-slate-900">Leave Requests & Balances</h1>
              <p className="text-xs text-slate-500 font-medium">
                Track leave balances, apply for leave, and manage leave approval workflows.
              </p>
            </div>
            {!isSuperAdmin && (
              <button
                onClick={() => setShowApplyModal(true)}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl transition-all shadow-xs text-xs"
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
                    {bal.leaveType.name}
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
                    style={{ width: `${Math.min(100, (bal.remaining / bal.allocated) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Leave Requests Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900">Leave Requests</h2>

            {loading ? (
              <p className="text-xs text-slate-400 animate-pulse font-medium">Loading leave requests...</p>
            ) : error ? (
              <p className="text-xs text-rose-500 font-semibold">{error}</p>
            ) : requests.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                <p className="text-xs text-slate-400 font-medium">No leave requests found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/80">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Dates</th>
                      <th className="py-3 px-4">Days</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {req.user?.name || "Self"}
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-semibold">
                          {req.leaveType.name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {new Date(req.startDate).toLocaleDateString()} - {new Date(req.endDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-black text-slate-900">
                          {req.totalDays}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate text-xs">
                          {req.reason}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 text-[11px] font-extrabold rounded-full ${req.status === "APPROVED"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : req.status === "REJECTED"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                          >
                            {req.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {req.status === "PENDING" ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAction(req.id, "APPROVED")}
                                className="px-2.5 py-1 bg-emerald-600 text-white font-extrabold text-xs rounded-lg hover:bg-emerald-700"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleAction(req.id, "REJECTED")}
                                className="px-2.5 py-1 bg-rose-600 text-white font-extrabold text-xs rounded-lg hover:bg-rose-700"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-medium">
                              {req.approvedBy ? `By ${req.approvedBy.name}` : "--"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Apply Leave Modal */}
          {showApplyModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
                <h2 className="text-base font-black text-slate-900">Apply for Leave</h2>
                <form onSubmit={handleApply} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Leave Type
                    </label>
                    <select
                      value={selectedTypeId}
                      onChange={(e) => setSelectedTypeId(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    >
                      {leaveTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.daysAllowed} days allowed)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Reason for Leave
                    </label>
                    <textarea
                      placeholder="Provide reason for request..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      rows={3}
                      required
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowApplyModal(false)}
                      className="px-4 py-2.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl shadow-xs disabled:opacity-50"
                    >
                      {submitting ? "Submitting..." : "Submit Application"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
