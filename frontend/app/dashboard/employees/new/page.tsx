"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  createEmployee,
  getEmployeeFilters,
  type Role,
  type Designation,
} from "@/services/employee.service";

function EyeIcon() {
  return (
    <svg className="w-4 h-4 text-slate-500 hover:text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400 hover:text-slate-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 013.98.837c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
    </svg>
  );
}

export default function AddEmployeePage() {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phoneNumber: "",
    password: "",
    confirmPassword: "",
    roleId: "",
    designationId: "",
  });

  const [roles, setRoles] = useState<Role[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const canManageEmployees =
    session?.user.role === "SUPER_ADMIN" ||
    (session?.user.role === "ADMIN" && session.user.permissions?.includes("MANAGE_EMPLOYEES"));

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/");
    }
  }, [isLoading, router, session]);

  useEffect(() => {
    if (!canManageEmployees && session) {
      router.replace("/dashboard");
    }
  }, [canManageEmployees, router, session]);

  useEffect(() => {
    if (session?.token) {
      fetchFilters();
    }
  }, [session?.token]);

  const fetchFilters = async () => {
    try {
      const { roles: rolesData, designations: designationsData } = await getEmployeeFilters(
        session!.token
      );
      setRoles(rolesData);
      setDesignations(designationsData);

      const employeeRole = rolesData.find((r) => r.name === "EMPLOYEE");
      if (employeeRole) {
        setFormData((prev) => ({ ...prev, roleId: String(employeeRole.id) }));
      }
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
    if (!formData.password) return "Password is required";
    if (formData.password.length < 8) return "Password must be at least 8 characters";
    if (formData.password !== formData.confirmPassword) return "Passwords do not match";
    if (!formData.roleId) return "Role is required";
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
      const employeeData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phoneNumber: formData.phoneNumber.trim() || undefined,
        password: formData.password,
        roleId: formData.roleId ? Number(formData.roleId) : undefined,
        designationId: formData.designationId ? Number(formData.designationId) : undefined,
      };

      await createEmployee(employeeData, session.token);

      setSuccess("Employee account created successfully!");
      setFormData({
        name: "",
        email: "",
        phoneNumber: "",
        password: "",
        confirmPassword: "",
        roleId: "",
        designationId: "",
      });

      setTimeout(() => {
        router.push("/dashboard/employees");
      }, 1500);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create employee";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || !session) return <main className="route-loading">Loading...</main>;
  if (!canManageEmployees) return <main className="route-loading">Access denied.</main>;

  const canCreateAdmins = session?.user.role === "SUPER_ADMIN";

  const handleSignOut = () => {
    logout();
    router.replace("/");
  };

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
          <div className="welcome mb-6">
            <p className="eyebrow">ADMINISTRATION</p>
            <h1>Add New Employee</h1>
            <p>Create a new employee user account and assign system access role.</p>
          </div>

          {error && <div className="error-message mb-4">{error}</div>}
          {success && <div className="success-message mb-4">{success}</div>}

          <form onSubmit={handleSubmit} className="form-card max-w-xl mx-auto bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="card-heading mb-6 border-b border-slate-100 pb-3">
              <h2 className="text-base font-extrabold text-slate-900">Create Employee Account</h2>
              <p className="text-xs text-slate-500 font-medium">Fill in the employee credentials and role details below.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="e.g. John Doe"
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
                  placeholder="e.g. john@company.com"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                  placeholder="e.g. +1 555-0199"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                  <div className="relative flex items-center">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => handleInputChange("password", e.target.value)}
                      placeholder="Minimum 8 characters"
                      required
                      className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
                  <div className="relative flex items-center">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                      placeholder="Confirm password"
                      required
                      className="w-full h-10 pl-3 pr-10 rounded-lg border border-slate-300 text-xs font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
                      title={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => router.push("/dashboard/employees")}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-xs disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Save Employee"}
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
