"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuth } from "@/hooks/use-auth";
import { updateProfile, changePassword } from "@/services/user.service";

export default function SettingsPage() {
  const router = useRouter();
  const { session, isLoading, logout, saveSession } = useAuth();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState({
    companyName: "INFOGRAINS Training and Consulting Services",
    workspaceSlug: "infograins-hrms",
    accentTheme: "ORANGE",
    sprintDuration: "WEEKLY",
    autoCloseCompletedSprints: true,
    strictHierarchy: true,
    emailNotifications: true,
    rbacEnforcement: "STRICT",
  });

  // Superadmin credentials state
  const [adminCreds, setAdminCreds] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [isUpdatingCreds, setIsUpdatingCreds] = useState(false);

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
    if (session?.user) {
      setAdminCreds((prev) => ({
        ...prev,
        name: session.user.name || "",
        email: session.user.email || "",
        phoneNumber: session.user.phoneNumber || "",
      }));
    }
  }, [isLoading, router, session]);

  if (isLoading || !session) return <main className="route-loading">Loading settings...</main>;

  const userRoleStr = typeof session.user.role === "string" ? session.user.role : (session.user.role as any)?.name || "";
  const isSuperAdmin = userRoleStr === "SUPER_ADMIN";

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage("Workspace configuration updated successfully!");
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleUpdateCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token) return;

    setIsUpdatingCreds(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      // Update profile info
      const updateData = {
        name: adminCreds.name,
        email: adminCreds.email,
        phoneNumber: adminCreds.phoneNumber,
      };

      const result = await updateProfile(session.user.id, updateData, session.token);

      if (result && result.user) {
        saveSession({
          ...session,
          user: { ...session.user, ...result.user },
        });
      }

      // If new password provided, change password
      if (adminCreds.newPassword) {
        if (adminCreds.newPassword !== adminCreds.confirmPassword) {
          throw new Error("New passwords do not match.");
        }
        if (adminCreds.newPassword.length < 8) {
          throw new Error("Password must be at least 8 characters.");
        }
        if (!adminCreds.currentPassword) {
          throw new Error("Current password is required to change password.");
        }

        await changePassword(
          session.user.id,
          adminCreds.currentPassword,
          adminCreds.newPassword,
          session.token
        );
      }

      setSuccessMessage("Super Admin credentials updated successfully!");
      setAdminCreds((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update credentials.");
    } finally {
      setIsUpdatingCreds(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <main className="app-shell">
        <Navbar user={session.user} onSignOut={handleSignOut} />
        <div className="dashboard-frame">
          <Sidebar user={session.user} canCreateAdmins={false} onSignOut={handleSignOut} />
          <section className="dashboard-content">
            <button onClick={() => router.push("/dashboard")} className="back-button">
              ← Back to Dashboard
            </button>
            <div className="error-message" style={{ margin: "20px 0", padding: "20px", borderRadius: "12px", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
              <h2 style={{ margin: "0 0 8px" }}>Access Restricted</h2>
              <p>Workspace settings and system configuration can only be accessed by Super Administrators.</p>
              <button
                onClick={() => router.push("/dashboard")}
                className="primary-button"
                style={{ marginTop: "16px" }}
              >
                Return to Dashboard
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={true} onSignOut={handleSignOut} />
        <section className="dashboard-content" style={{ paddingBottom: "60px" }}>
          <button onClick={() => router.push("/dashboard")} className="back-button">
            ← Back to Dashboard
          </button>

          <div className="welcome mb-6">
            <p className="eyebrow">SYSTEM CONFIGURATION</p>
            <h1>Super Admin & Workspace Settings</h1>
            <p>Customize project workflows, dynamic Super Admin credentials, theme styling, and security settings.</p>
          </div>

          {successMessage && <div className="success-message mb-6">{successMessage}</div>}
          {errorMessage && <div className="error-message mb-6">{errorMessage}</div>}

          {/* Super Admin Credentials Card */}
          <form onSubmit={handleUpdateCreds} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs mb-6">
            <h2 className="text-sm font-extrabold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
              <span>👤</span> Super Admin Credentials & Account
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Super Admin Name</label>
                <input
                  type="text"
                  value={adminCreds.name}
                  onChange={(e) => setAdminCreds({ ...adminCreds, name: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={adminCreds.email}
                  onChange={(e) => setAdminCreds({ ...adminCreds, email: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone / Contact Number</label>
                <input
                  type="tel"
                  value={adminCreds.phoneNumber}
                  onChange={(e) => setAdminCreds({ ...adminCreds, phoneNumber: e.target.value })}
                  placeholder="e.g. +91 9876543210"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase mb-3">Change Super Admin Password (Optional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={adminCreds.currentPassword}
                    onChange={(e) => setAdminCreds({ ...adminCreds, currentPassword: e.target.value })}
                    placeholder="Enter current password"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={adminCreds.newPassword}
                    onChange={(e) => setAdminCreds({ ...adminCreds, newPassword: e.target.value })}
                    placeholder="New password (min 8 chars)"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={adminCreds.confirmPassword}
                    onChange={(e) => setAdminCreds({ ...adminCreds, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={isUpdatingCreds}
                className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-xs"
              >
                {isUpdatingCreds ? "Updating Account..." : "Update Super Admin Account"}
              </button>
            </div>
          </form>

          <form onSubmit={handleSaveSettings} className="space-y-6 w-full">
            {/* Organization & Branding */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h2 className="text-sm font-extrabold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span>🏢</span> Organization & Branding Settings
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={settings.companyName}
                    onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Workspace Slug</label>
                  <input
                    type="text"
                    value={settings.workspaceSlug}
                    onChange={(e) => setSettings({ ...settings, workspaceSlug: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-slate-50 text-slate-500"
                    readOnly
                  />
                </div>
              </div>
            </div>

            {/* Agile & Sprint Workflows */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h2 className="text-sm font-extrabold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span>⚡</span> Agile & Sprint Workflow Configuration
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Default Sprint Duration</label>
                  <select
                    value={settings.sprintDuration}
                    onChange={(e) => setSettings({ ...settings, sprintDuration: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
                  >
                    <option value="WEEKLY">1 Week (Weekly)</option>
                    <option value="BIWEEKLY">2 Weeks (Bi-weekly)</option>
                    <option value="MONTHLY">4 Weeks (Monthly)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Strict Jira Hierarchy Rules</label>
                  <select
                    value={settings.strictHierarchy ? "ENABLE" : "DISABLE"}
                    onChange={(e) => setSettings({ ...settings, strictHierarchy: e.target.value === "ENABLE" })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
                  >
                    <option value="ENABLE">Enabled (Epic → Story/Task → Subtask)</option>
                    <option value="DISABLE">Disabled (Flexible relationships)</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoClose"
                  checked={settings.autoCloseCompletedSprints}
                  onChange={(e) => setSettings({ ...settings, autoCloseCompletedSprints: e.target.checked })}
                  className="w-4 h-4 rounded text-orange-500 border-slate-300"
                />
                <label htmlFor="autoClose" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Auto-archive completed sprints when finishing iteration
                </label>
              </div>
            </div>

            {/* Security & Access Policy */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h2 className="text-sm font-extrabold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span>🛡️</span> Security & Access Control
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">RBAC Policy Enforcement</label>
                  <select
                    value={settings.rbacEnforcement}
                    onChange={(e) => setSettings({ ...settings, rbacEnforcement: e.target.value })}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
                  >
                    <option value="STRICT">Strict (Granular permissions per role)</option>
                    <option value="MODERATE">Moderate (Role-based fallbacks)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <input
                    type="checkbox"
                    id="emailNotif"
                    checked={settings.emailNotifications}
                    onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
                    className="w-4 h-4 rounded text-orange-500 border-slate-300"
                  />
                  <label htmlFor="emailNotif" className="text-xs font-bold text-slate-700 cursor-pointer">
                    Enable System Email Alerts & Daily Digests
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-xs"
              >
                Save Workspace Configuration
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
