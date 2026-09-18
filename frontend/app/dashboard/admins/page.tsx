"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/services/api";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  role: { id: number; name: string };
  designation?: { id: number; name: string };
};

export default function SystemAdminsPage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canCreateAdmins = session?.user?.role === "SUPER_ADMIN";

  const fetchAdmins = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{ admins: AdminUser[] }>("/api/admins", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      setAdmins(data.admins || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system administrators");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  useEffect(() => {
    if (!isLoading && !session) router.replace("/");
    if (session?.token) fetchAdmins();
  }, [isLoading, router, session, fetchAdmins]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token || !form.name.trim() || !form.email.trim() || form.password.length < 8) return;

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await apiRequest("/api/admins", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.token}` },
        body: JSON.stringify(form),
      });

      setSuccessMessage(`Administrator ${form.name} created successfully!`);
      setForm({ name: "", email: "", password: "" });
      setShowModal(false);
      fetchAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create administrator");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  if (isLoading || !session) return <main className="route-loading">Loading administrators...</main>;

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={canCreateAdmins} onSignOut={handleSignOut} />
        <section className="dashboard-content">
          <button onClick={() => router.push("/dashboard")} className="back-button">
            ← Back to Dashboard
          </button>

          <div className="welcome flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <p className="eyebrow">ADMINISTRATION CONTROL</p>
              <h1>System Administrators</h1>
              <p>Manage system administrator accounts and privilege delegations.</p>
            </div>

            {canCreateAdmins && (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-2"
              >
                <span>+</span> Add New Administrator
              </button>
            )}
          </div>

          {error && <div className="error-message mb-4">{error}</div>}
          {successMessage && <div className="success-message mb-4">{successMessage}</div>}

          {/* Admins Table */}
          <div className="workspace-list-card">
            <div className="workspace-table-scroll">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Administrator</th>
                    <th>Role Level</th>
                    <th>Email Address</th>
                    <th>Designation</th>
                    <th>Account Status</th>
                    <th>Created Date</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-500 text-xs font-medium">
                        Loading administrators...
                      </td>
                    </tr>
                  ) : admins.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-6 text-slate-500 text-xs font-medium">
                        No administrators found.
                      </td>
                    </tr>
                  ) : (
                    admins.map((admin) => (
                      <tr key={admin.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center">
                              {admin.name.slice(0, 1).toUpperCase()}
                            </span>
                            <div>
                              <strong className="text-slate-900 text-xs block">{admin.name}</strong>
                              <span className="text-[10px] text-slate-400 font-semibold">ADM-{admin.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                              admin.role.name === "SUPER_ADMIN"
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-orange-50 text-orange-800 border-orange-200"
                            }`}
                          >
                            {admin.role.name.replace("_", " ")}
                          </span>
                        </td>
                        <td className="text-xs font-medium text-slate-600">{admin.email}</td>
                        <td className="text-xs font-semibold text-slate-700">
                          {admin.designation?.name || "System Administrator"}
                        </td>
                        <td>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                              admin.status === "ACTIVE"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-rose-50 text-rose-800 border-rose-200"
                            }`}
                          >
                            {admin.status}
                          </span>
                        </td>
                        <td className="text-xs font-medium text-slate-500">
                          {new Date(admin.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Create Admin Modal */}
          {showModal && (
            <div className="fixed inset-0 z-[2000] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 className="text-base font-extrabold text-slate-900">Add System Administrator</h3>
                  <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 font-bold">
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateAdmin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Vikramaditya Singh"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="admin@infograins.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Initial Password</label>
                    <input
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs disabled:opacity-50"
                    >
                      {submitting ? "Creating..." : "Save Administrator"}
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
