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

  const handleToggleEdit = () => {
    setEditMode(!editMode);
    setError(null);
    setSuccess(null);
  };

  if (isLoading || !session) {
    return <main className="route-loading">Loading employee details...</main>;
  }

  if (!employee) {
    return (
      <main className="app-shell">
        <Navbar user={session.user} onSignOut={handleSignOut} />
        <div className="dashboard-frame">
          <Sidebar
            user={session.user}
            canCreateAdmins={canCreateAdmins}
            onSignOut={handleSignOut}
          />
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
        <Sidebar
          user={session.user}
          canCreateAdmins={canCreateAdmins}
          onSignOut={handleSignOut}
        />
        <section className="dashboard-content">
          <button onClick={() => router.push("/dashboard/employees")} className="back-button">
            ← Back to Employees
          </button>

          <div className="welcome mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">EMPLOYEE WORKSPACE</p>
              <h1>Employee Details</h1>
              <p>View & manage complete user credentials and employee profile records.</p>
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={handleToggleEdit}
                className={`px-4 py-2 rounded-lg font-bold text-xs transition-all ${editMode
                    ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                    : "bg-orange-500 hover:bg-orange-600 text-white shadow-xs"
                  }`}
              >
                {editMode ? "Cancel Editing" : "Edit Employee Record"}
              </button>
            )}
          </div>

          {error && <div className="error-message mb-4">{error}</div>}
          {success && <div className="success-message mb-4">{success}</div>}

          {/* Employee Header Profile Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs mb-6 max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <span className="w-14 h-14 rounded-2xl bg-orange-500 text-white font-extrabold text-xl flex items-center justify-center border-2 border-orange-200 shadow-xs">
                {employee.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-slate-900 leading-snug">{employee.name}</h2>
                  <span className="text-xs font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                    {prof?.employeeCode || `EMP-${employee.id}`}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">{employee.email} {employee.phoneNumber ? `• ${employee.phoneNumber}` : ""}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-slate-900 text-white tracking-wider">
                    {employee.role?.name || "Employee"}
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                    {employee.designation?.name || "Unassigned Designation"}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase border ${employee.status === "ACTIVE"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-rose-50 text-rose-800 border-rose-200"
                  }`}
              >
                {employee.status || "UNKNOWN"}
              </span>
            </div>
          </div>

          {/* Details / Edit Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-4xl mx-auto">
            {editMode ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-orange-600">User Account & Credentials</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      placeholder="Enter full name"
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="Enter email address"
                      required
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                      placeholder="Enter phone number"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>
                </div>

                {canManageEmployees && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">System Role</label>
                      <select
                        value={formData.roleId}
                        onChange={(e) => handleInputChange("roleId", e.target.value)}
                        required
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
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
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
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
                        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="border-b border-slate-100 pb-3 pt-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-orange-600">Employee Profile & HR Information</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Employee Code</label>
                    <input
                      type="text"
                      value={formData.employeeCode}
                      onChange={(e) => handleInputChange("employeeCode", e.target.value)}
                      placeholder="e.g. EMP-101"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={formData.dob}
                      onChange={(e) => handleInputChange("dob", e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                    <select
                      value={formData.gender}
                      onChange={(e) => handleInputChange("gender", e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
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
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Employment Type</label>
                    <select
                      value={formData.employmentType}
                      onChange={(e) => handleInputChange("employmentType", e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
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
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium bg-white"
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
                    className="w-full p-3 rounded-lg border border-slate-300 text-xs font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">New Password (Optional)</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => handleInputChange("password", e.target.value)}
                      placeholder="Leave blank to keep unchanged"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
                    <input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                      placeholder="Confirm password"
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleToggleEdit}
                    className="flex-1 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                  >
                    {loading ? "Saving Record..." : "Save Record Changes"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">User & Credentials</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Employee ID / Code</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">{prof?.employeeCode || `EMP-${employee.id}`}</span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Email Address</span>
                      <span className="font-bold text-slate-900 text-sm">{employee.email}</span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Phone Number</span>
                      <span className="font-bold text-slate-900 text-sm">{employee.phoneNumber || "Not set"}</span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">System Role</span>
                      <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-extrabold uppercase bg-slate-900 text-white">
                        {employee.role?.name || "Employee"}
                      </span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Designation</span>
                      <span className="font-bold text-slate-900 text-sm">
                        {employee.designation?.name || "Not assigned"}
                      </span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Account Status</span>
                      <span className="font-bold text-slate-900">{employee.status}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Employee Profile Info</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Date of Birth</span>
                      <span className="font-bold text-slate-900">{prof?.dob ? new Date(prof.dob).toLocaleDateString() : "Not provided"}</span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Gender</span>
                      <span className="font-bold text-slate-900">{prof?.gender || "Not specified"}</span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Date of Joining</span>
                      <span className="font-bold text-slate-900">{prof?.dateOfJoining ? new Date(prof.dateOfJoining).toLocaleDateString() : (employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : "N/A")}</span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Employment Type</span>
                      <span className="font-bold text-slate-900">{prof?.employmentType || "FULL_TIME"}</span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Employment Status</span>
                      <span className="font-bold text-slate-900">{prof?.employmentStatus || "PERMANENT"}</span>
                    </div>

                    <div>
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Work Location</span>
                      <span className="font-bold text-slate-900">{prof?.workLocation || "OFFICE"}</span>
                    </div>

                    <div className="md:col-span-3">
                      <span className="font-extrabold uppercase text-slate-500 block mb-1">Address</span>
                      <span className="font-medium text-slate-800">{prof?.address || "No address on file."}</span>
                    </div>
                  </div>
                </div>

                {employee.assignedWorkItems && employee.assignedWorkItems.length > 0 && (
                  <div className="pt-4 border-t border-slate-100">
                    <span className="font-extrabold uppercase text-slate-400 block mb-2">Assigned Work Items</span>
                    <div className="flex flex-wrap gap-2">
                      {employee.assignedWorkItems.map((item) => (
                        <span
                          key={item.id}
                          className="px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 font-bold text-slate-800 text-xs"
                        >
                          {item.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
