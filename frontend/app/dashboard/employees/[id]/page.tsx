"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  getEmployeeById,
  updateEmployee,
  getEmployeeFilters,
  type Employee,
  type Role,
  type Designation,
} from "@/services/employee.service";

export default function ViewEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const { session, isLoading, logout } = useAuth();
  const employeeId = Number(params.id);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "credentials" | "hr" | "workItems">("overview");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
    roleId: "",
    designationId: "",
    status: "",
    employeeCode: "",
    dob: "",
    gender: "",
    address: "",
    dateOfJoining: "",
    employmentType: "FULL_TIME",
    employmentStatus: "PERMANENT",
    workLocation: "OFFICE",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManageEmployees =
    session?.user.role === "SUPER_ADMIN" ||
    (session?.user.role === "ADMIN" && session.user.permissions?.includes("MANAGE_EMPLOYEES"));

  const isSelf = employee && session?.user.id === employee.id;
  const canEdit = canManageEmployees || isSelf;
  const canCreateAdmins = session?.user.role === "SUPER_ADMIN";

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  useEffect(() => {
    if (session?.token) {
      fetchEmployee();
      fetchFilters();
    }
  }, [session?.token, employeeId]);

  useEffect(() => {
    if (employee) {
      const prof = employee.employeeProfile;
      setFormData({
        name: employee.name || "",
        email: employee.email || "",
        phoneNumber: employee.phoneNumber || "",
        password: "",
        confirmPassword: "",
        roleId: employee.role?.id ? String(employee.role.id) : "",
        designationId: employee.designation?.id ? String(employee.designation.id) : "",
        status: employee.status || "",
        employeeCode: prof?.employeeCode || `EMP-${employee.id}`,
        dob: prof?.dob ? prof.dob.split("T")[0] : "",
        gender: prof?.gender || "",
        address: prof?.address || "",
        dateOfJoining: prof?.dateOfJoining ? prof.dateOfJoining.split("T")[0] : "",
        employmentType: prof?.employmentType || "FULL_TIME",
        employmentStatus: prof?.employmentStatus || "PERMANENT",
        workLocation: prof?.workLocation || "OFFICE",
      });
    }
  }, [employee]);

  const fetchEmployee = async () => {
    try {
      setLoading(true);
      const { employee: emp } = await getEmployeeById(employeeId, session!.token);
      setEmployee(emp);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch employee";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilters = async () => {
    try {
      const { roles: rolesData, designations: designationsData } = await getEmployeeFilters(
        session!.token
      );
      setRoles(rolesData);
      setDesignations(designationsData);
    } catch (err) {
      console.error("Failed to fetch filters:", err);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(null);
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return "Name is required";
    if (!formData.email.trim()) return "Email is required";
    if (!formData.email.includes("@") || !formData.email.includes(".")) {
      return "Please enter a valid email address";
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      return "Passwords do not match";
    }
    if (formData.password && formData.password.length < 8) {
      return "Password must be at least 8 characters";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!session?.token) return;

    setLoading(true);
    setError(null);

    try {
      const updateData: Record<string, unknown> = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phoneNumber: formData.phoneNumber.trim() || null,
        employeeCode: formData.employeeCode,
        dob: formData.dob || null,
        gender: formData.gender || null,
        address: formData.address || null,
        dateOfJoining: formData.dateOfJoining || null,
        employmentType: formData.employmentType,
        employmentStatus: formData.employmentStatus,
        workLocation: formData.workLocation,
      };

      if (canManageEmployees) {
        if (formData.roleId) updateData.roleId = Number(formData.roleId);
        if (formData.designationId) updateData.designationId = Number(formData.designationId);
        if (formData.status) updateData.status = formData.status;
      }

      if (formData.password) {
        updateData.password = formData.password;
      }

      await updateEmployee(employeeId, updateData, session.token);

      setSuccess("Employee & Profile updated successfully!");
      setEditMode(false);
      fetchEmployee();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update employee";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading employee profile...</main>;
  }

  if (!employee) {
    return (
      <main className="app-shell">
        <Navbar user={session.user} onSignOut={handleSignOut} />
        <div className="dashboard-frame">
          <Sidebar user={session.user} canCreateAdmins={canCreateAdmins} onSignOut={handleSignOut} />
          <section className="dashboard-content">
            <button onClick={() => router.push("/dashboard/employees")} className="back-button">
              ← Back to Employees
            </button>
            <div className="error-message">Employee record not found.</div>
          </section>
        </div>
      </main>
    );
  }

  const prof = employee.employeeProfile;

  return (
    <main className="app-shell">
      <Navbar user={session.user} onSignOut={handleSignOut} />
      <div className="dashboard-frame">
        <Sidebar user={session.user} canCreateAdmins={canCreateAdmins} onSignOut={handleSignOut} />
        <section className="dashboard-content space-y-6 w-full">
          {/* Header Action Bar */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <button
              onClick={() => router.push("/dashboard/employees")}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs transition-all cursor-pointer"
            >
              ← Back
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditMode(!editMode);
                  setError(null);
                  setSuccess(null);
                }}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer ${editMode
                  ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                  : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                  }`}
              >
                {editMode ? "✕ Cancel" : "✏️ Edit Employee Profile"}
              </button>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          {/* Hero Profile Banner */}
          <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-800">
            <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-400 text-white font-black text-3xl md:text-4xl flex items-center justify-center border-4 border-slate-800 shadow-2xl">
                    {employee.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span
                    className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-slate-900 ${employee.status === "ACTIVE" ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">{employee.name}</h1>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-orange-500/20 text-orange-300 border border-orange-400/30">
                      {prof?.employeeCode || `EMP-${employee.id}`}
                    </span>
                  </div>

                  <p className="text-xs md:text-sm text-slate-300 font-medium flex items-center gap-3 flex-wrap">
                    <span>✉️ {employee.email}</span>
                    {employee.phoneNumber && <span>📞 {employee.phoneNumber}</span>}
                  </p>

                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    <span className="px-3 py-1 rounded-md text-[11px] font-black uppercase tracking-wider bg-orange-500 text-white shadow-xs">
                      {employee.role?.name || "Employee"}
                    </span>
                    <span className="px-3 py-1 rounded-md text-[11px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                      {employee.designation?.name || "Member"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start md:items-end gap-2 border-t md:border-t-0 border-slate-800 pt-4 md:pt-0 w-full md:w-auto">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Account Status</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${employee.status === "ACTIVE"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    }`}
                >
                  {employee.status || "UNKNOWN"}
                </span>
                <span className="text-[11px] text-slate-400 font-medium mt-1">
                  Joined: {prof?.dateOfJoining ? new Date(prof.dateOfJoining).toLocaleDateString() : (employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : "N/A")}
                </span>
              </div>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Employment Type</span>
              <span className="text-base font-black text-slate-900 mt-1 block">{prof?.employmentType || "FULL TIME"}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Work Location</span>
              <span className="text-base font-black text-slate-900 mt-1 block">{prof?.workLocation || "OFFICE"}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Status</span>
              <span className="text-base font-black text-slate-900 mt-1 block">{prof?.employmentStatus || "PERMANENT"}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Work Items</span>
              <span className="text-base font-black text-orange-600 mt-1 block">{employee.assignedWorkItems?.length || 0} Assigned</span>
            </div>
          </div>

          {/* Form or View Section */}
          {editMode ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm">
              <h2 className="text-lg font-black text-slate-900 mb-6 pb-3 border-b border-slate-100 flex items-center gap-2">
                <span>✏️ Edit Employee Record</span>
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-orange-600">User Account Credentials</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                        placeholder="Enter full name"
                        required
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        placeholder="Enter email address"
                        required
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        value={formData.phoneNumber}
                        onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                        placeholder="Enter phone number"
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {canManageEmployees && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">System Role</label>
                        <select
                          value={formData.roleId}
                          onChange={(e) => handleInputChange("roleId", e.target.value)}
                          required
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        >
                          <option value="">Select Role</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                        <select
                          value={formData.designationId}
                          onChange={(e) => handleInputChange("designationId", e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        >
                          <option value="">Select Designation</option>
                          {designations.map((designation) => (
                            <option key={designation.id} value={designation.id}>
                              {designation.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Account Status</label>
                        <select
                          value={formData.status}
                          onChange={(e) => handleInputChange("status", e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="INACTIVE">Inactive</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-orange-600">Employee Profile & HR Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Employee Code</label>
                      <input
                        type="text"
                        value={formData.employeeCode}
                        onChange={(e) => handleInputChange("employeeCode", e.target.value)}
                        placeholder="e.g. EMP-101"
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={formData.dob}
                        onChange={(e) => handleInputChange("dob", e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                      <select
                        value={formData.gender}
                        onChange={(e) => handleInputChange("gender", e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      >
                        <option value="">Select Gender</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Date of Joining</label>
                      <input
                        type="date"
                        value={formData.dateOfJoining}
                        onChange={(e) => handleInputChange("dateOfJoining", e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Employment Type</label>
                      <select
                        value={formData.employmentType}
                        onChange={(e) => handleInputChange("employmentType", e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      >
                        <option value="FULL_TIME">Full Time</option>
                        <option value="PART_TIME">Part Time</option>
                        <option value="CONTRACT">Contract</option>
                        <option value="INTERN">Intern</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Work Location</label>
                      <select
                        value={formData.workLocation}
                        onChange={(e) => handleInputChange("workLocation", e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      >
                        <option value="OFFICE">Office</option>
                        <option value="REMOTE">Remote</option>
                        <option value="HYBRID">Hybrid</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Residential Address</label>
                    <textarea
                      rows={2}
                      value={formData.address}
                      onChange={(e) => handleInputChange("address", e.target.value)}
                      placeholder="Enter full address..."
                      className="w-full p-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-orange-600">Password & Security</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">New Password (Optional)</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        placeholder="Leave blank to keep unchanged"
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
                      <input
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                        placeholder="Confirm password"
                        className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-medium focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  {/* <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    className="px-5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs shadow-2xs cursor-pointer"
                  >
                    Cancel
                  </button> */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {loading ? "Saving Record..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* View Mode with Tabs */
            <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-200 gap-6">
                <button
                  onClick={() => setActiveTab("overview")}
                  className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${activeTab === "overview"
                    ? "border-orange-500 text-orange-600 font-black"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                  📋 Overview
                </button>
                <button
                  onClick={() => setActiveTab("credentials")}
                  className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${activeTab === "credentials"
                    ? "border-orange-500 text-orange-600 font-black"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                  🔑 Credentials & Account
                </button>
                <button
                  onClick={() => setActiveTab("hr")}
                  className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${activeTab === "hr"
                    ? "border-orange-500 text-orange-600 font-black"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                  🏢 HR & Personal Info
                </button>
                <button
                  onClick={() => setActiveTab("workItems")}
                  className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${activeTab === "workItems"
                    ? "border-orange-500 text-orange-600 font-black"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                    }`}
                >
                  📌 Assigned Work Items ({employee.assignedWorkItems?.length || 0})
                </button>
              </div>

              {/* Tab 1: Overview */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 space-y-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Account Summary</h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="font-bold text-slate-500">Employee ID</span>
                          <span className="font-mono font-black text-slate-900">{prof?.employeeCode || `EMP-${employee.id}`}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="font-bold text-slate-500">Email Address</span>
                          <span className="font-bold text-slate-900">{employee.email}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="font-bold text-slate-500">Phone</span>
                          <span className="font-bold text-slate-900">{employee.phoneNumber || "Not set"}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="font-bold text-slate-500">System Role</span>
                          <span className="font-black text-orange-600">{employee.role?.name || "Employee"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200/80 space-y-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Employment Summary</h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="font-bold text-slate-500">Designation</span>
                          <span className="font-bold text-slate-900">{employee.designation?.name || "Unassigned"}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="font-bold text-slate-500">Employment Type</span>
                          <span className="font-bold text-slate-900">{prof?.employmentType || "FULL TIME"}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="font-bold text-slate-500">Work Location</span>
                          <span className="font-bold text-slate-900">{prof?.workLocation || "OFFICE"}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="font-bold text-slate-500">Joining Date</span>
                          <span className="font-bold text-slate-900">
                            {prof?.dateOfJoining ? new Date(prof.dateOfJoining).toLocaleDateString() : (employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : "N/A")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Credentials & Account */}
              {activeTab === "credentials" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Employee Code</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">{prof?.employeeCode || `EMP-${employee.id}`}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Email Address</span>
                    <span className="font-bold text-slate-900 text-sm">{employee.email}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Phone Number</span>
                    <span className="font-bold text-slate-900 text-sm">{employee.phoneNumber || "Not set"}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">System Role</span>
                    <span className="font-black text-orange-600 text-sm">{employee.role?.name || "Employee"}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Designation</span>
                    <span className="font-bold text-slate-900 text-sm">{employee.designation?.name || "Not assigned"}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Account Status</span>
                    <span className="font-bold text-emerald-600 text-sm">{employee.status}</span>
                  </div>
                </div>
              )}

              {/* Tab 3: HR & Personal Info */}
              {activeTab === "hr" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Date of Birth</span>
                    <span className="font-bold text-slate-900 text-sm">{prof?.dob ? new Date(prof.dob).toLocaleDateString() : "Not specified"}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Gender</span>
                    <span className="font-bold text-slate-900 text-sm">{prof?.gender || "Not specified"}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Date of Joining</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {prof?.dateOfJoining ? new Date(prof.dateOfJoining).toLocaleDateString() : (employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : "N/A")}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Employment Type</span>
                    <span className="font-bold text-slate-900 text-sm">{prof?.employmentType || "FULL TIME"}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Work Location</span>
                    <span className="font-bold text-slate-900 text-sm">{prof?.workLocation || "OFFICE"}</span>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Employment Status</span>
                    <span className="font-bold text-slate-900 text-sm">{prof?.employmentStatus || "PERMANENT"}</span>
                  </div>
                  <div className="md:col-span-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="font-extrabold uppercase text-slate-400 block mb-1">Residential Address</span>
                    <span className="font-medium text-slate-800 text-sm">{prof?.address || "No address record."}</span>
                  </div>
                </div>
              )}

              {/* Tab 4: Assigned Work Items */}
              {activeTab === "workItems" && (
                <div>
                  {employee.assignedWorkItems && employee.assignedWorkItems.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {employee.assignedWorkItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                        >
                          <div>
                            <span className="font-bold text-slate-900 text-xs block">{item.title}</span>
                            <span className="text-[10px] text-slate-500">ID #{item.id}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-orange-100 text-orange-700">
                            Work Item
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs italic">No active work items assigned to this employee.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
