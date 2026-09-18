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

export default function HRSettingsPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();

  const [settings, setSettings] = useState<HRSetting[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("EMPLOYMENT_TYPE");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [newKey, setNewKey] = useState<string>("");
  const [newValue, setNewValue] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  const categories = [
    { key: "EMPLOYMENT_TYPE", label: "Employment Types" },
    { key: "WORK_LOCATION", label: "Work Locations" },
    { key: "SHIFT_TYPE", label: "Shift Schedules" },
    { key: "LEAVE_CATEGORY", label: "Leave Categories" },
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

  useEffect(() => {
    if (session?.token) {
      fetchSettings();
    }
  }, [activeCategory, session?.token]);

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

  if (isLoading || !session) {
    return <main className="route-loading">Loading HR settings...</main>;
  }

  const roleName = typeof session.user?.role === "string" ? session.user.role : (session.user?.role as any)?.name || "";
  const isSuperAdmin = roleName === "SUPER_ADMIN" || (session.user?.role as any) === 1;

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={isSuperAdmin} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "80px" }}>
          {/* Back button */}
          <button
            onClick={() => router.push("/dashboard")}
            className="back-button mb-4 text-xs font-bold text-orange-600 flex items-center gap-1"
          >
            ← Back to Dashboard
          </button>

          {/* Header */}
          <div className="welcome mb-6">
            <p className="eyebrow">HR MANAGEMENT</p>
            <h1 className="text-2xl font-black text-slate-900">Dynamic HR Settings</h1>
            <p className="text-xs text-slate-500 font-medium">
              Configure dynamic dropdown options and monthly leave policy criteria across HR modules.
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
                Set the default paid leave days credited per employee per month. Current policy grants <strong className="text-orange-400 font-black">1.5 days/month</strong> (18 days annual allocation).
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
                  className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-xs transition-all"
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
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${
                  activeCategory === cat.key
                    ? "bg-orange-500 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add New Setting Form */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h2 className="text-sm font-extrabold text-slate-900">Add Option</h2>
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
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20"
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
                  className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs disabled:opacity-50"
                >
                  {submitting ? "Adding..." : "Add Setting Option"}
                </button>
              </form>
            </div>

            {/* Existing Options Table */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h2 className="text-sm font-extrabold text-slate-900">Active Options</h2>

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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
