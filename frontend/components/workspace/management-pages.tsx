"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { createPermission, deleteDesignation, deleteRole, getDesignations, getRoles, saveDesignation, saveRolePermissions, type Designation, type Permission, type Role } from "@/services/workspace.service";
import { useAuth } from "@/hooks/use-auth";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const { session, isLoading, logout } = useAuth();
  if (isLoading || !session) return <main className="route-loading">Loading your workspace...</main>;
  const signOut = () => { logout(); router.replace("/"); };
  return <main className="app-shell"><Navbar user={session.user} onSignOut={signOut} /><div className="dashboard-frame"><Sidebar user={session.user} canCreateAdmins={session.user.role === "SUPER_ADMIN"} onSignOut={signOut} /><section className="dashboard-content">{children}</section></div></main>;
}

export function DesignationManager() {
  const { session } = useAuth();
  const [items, setItems] = useState<Designation[]>([]);
  const [form, setForm] = useState<Partial<Designation>>({});
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 10;
  const totalPages = Math.ceil(items.length / pageSize);
  const paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const load = () =>
    session?.token &&
    getDesignations(session.token)
      .then(({ items }) => setItems(items))
      .catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [session?.token]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.token) return;
    try {
      await saveDesignation(form, session.token);
      setForm({});
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save designation");
    }
  };

  return (
    <DashboardShell>
      <div className="welcome">
        <p className="eyebrow">ADMINISTRATION</p>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Designations</h2>
        <p>Create, update, or deactivate job titles.</p>
      </div>

      <form className="management-form" onSubmit={save}>
        <input
          placeholder="Designation name"
          value={form.name || ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          placeholder="Description"
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button className="primary-button">
          {form.id ? "Save changes" : "Add designation"}
        </button>
        {form.id && (
          <button
            type="button"
            className="text-button"
            onClick={() => setForm({})}
          >
            Cancel edit
          </button>
        )}
      </form>

      {error && <p className="error-message">{error}</p>}

      <div className="workspace-list-card">
        {paginatedItems.map((item) => (
          <div className="management-row" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <small>{item.description || "No description"}</small>
            </div>
            <span>{item.status ? "Active" : "Inactive"}</span>
            <button className="text-button" onClick={() => setForm(item)}>
              Edit
            </button>
            <button
              className="text-button danger-button"
              onClick={async () => {
                if (
                  session?.token &&
                  confirm(`Delete designation ${item.name}?`)
                ) {
                  await deleteDesignation(item.id, session.token);
                  load();
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}

        {totalPages > 1 && (
          <div className="pagination-container" style={{ padding: "16px 20px" }}>
            <div className="pagination-info">
              Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> -{" "}
              <strong>{Math.min(currentPage * pageSize, items.length)}</strong> of{" "}
              <strong>{items.length}</strong> designations
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                ‹ Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`pagination-btn ${p === currentPage ? "active" : ""}`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="pagination-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

export function RolesPermissionManager() {
  const { session } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleId, setRoleId] = useState<number>();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [permissionName, setPermissionName] = useState("");
  const [permissionDescription, setPermissionDescription] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const userPermissions = useMemo(() => Array.isArray(session?.user?.permissions) ? session.user.permissions : [], [session?.user?.permissions]);
  const roleName = typeof session?.user?.role === "string" ? session.user.role : (session?.user?.role as any)?.name;
  const isSuperAdmin = roleName === "SUPER_ADMIN" || (session?.user?.role as any) === 1;
  const canViewRoles = isSuperAdmin || userPermissions.includes("VIEW_PERMISSIONS") || userPermissions.includes("MANAGE_PERMISSIONS") || userPermissions.includes("MANAGE_ROLES") || userPermissions.includes("admin:role_manage");
  const canManageRoles = isSuperAdmin || userPermissions.includes("MANAGE_PERMISSIONS") || userPermissions.includes("MANAGE_ROLES") || userPermissions.includes("admin:role_manage");

  const pageSize = 8;
  const totalPages = Math.ceil(permissions.length / pageSize);
  const paginatedPermissions = permissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const load = () => {
    if (!session?.token) return;
    getRoles(session.token)
      .then(({ roles, permissions }) => {
        setAccessDenied(null);
        setRoles(roles);
        setPermissions(permissions);
        if (!roleId && roles[0]) {
          setRoleId(roles[0].id);
          setSelected(roles[0].permissionIds);
        }
      })
      .catch((err) => {
        const errorText = err instanceof Error ? err.message : "Failed to load roles and permissions";
        if (
          errorText.toLowerCase().includes("permission") ||
          errorText.toLowerCase().includes("access") ||
          errorText.toLowerCase().includes("denied") ||
          errorText.toLowerCase().includes("403")
        ) {
          setAccessDenied(errorText);
        } else {
          setMessage(errorText);
        }
      });
  };

  useEffect(() => {
    load();
  }, [session?.token]);

  const role = roles.find((item) => item.id === roleId);

  const choose = (id: number) => {
    const next = roles.find((item) => item.id === id);
    setRoleId(id);
    setSelected(next?.permissionIds || []);
    setMessage("");
  };

  const toggle = (name: string) => {
    if (!canManageRoles) return;
    setSelected((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );
  };

  const save = async () => {
    if (!session?.token || !roleId || !canManageRoles) return;
    try {
      await saveRolePermissions(
        roleId,
        permissions
          .filter((p) => selected.includes(p.name))
          .map((p) => p.id),
        session.token
      );
      setMessage("Permissions saved.");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update permissions");
    }
  };

  const addPermission = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.token || !canManageRoles) return;
    try {
      await createPermission(
        permissionName,
        permissionDescription,
        session.token
      );
      setPermissionName("");
      setPermissionDescription("");
      setMessage("Permission added.");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to add permission");
    }
  };

  const removeRole = async () => {
    if (
      !session?.token ||
      !roleId ||
      !role ||
      !isSuperAdmin ||
      !confirm(`Delete role "${role.name}"?`)
    )
      return;
    await deleteRole(roleId, session.token);
    setRoleId(undefined);
    setMessage(`Role "${role.name}" deleted.`);
    load();
  };

  if (accessDenied || (!canViewRoles && !isSuperAdmin)) {
    return (
      <DashboardShell>
        <div className="welcome">
          <p className="eyebrow" style={{ color: "#ef4444" }}>ACCESS RESTRICTED</p>
          <h1 style={{ color: "#0f172a" }}>Roles & permissions</h1>
          <div
            style={{
              marginTop: "20px",
              padding: "24px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "12px",
              color: "#991b1b",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", fontWeight: 700 }}>
              Access Denied
            </h3>
            <p style={{ margin: 0, fontSize: "0.95rem" }}>
              {accessDenied || "Your account does not have the \"VIEW_PERMISSIONS\" permission required to view or manage role configurations. Please contact a Super Administrator to grant access."}
            </p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="welcome">
        <p className="eyebrow">ADMINISTRATION</p>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Roles & permissions</h3>
        <p>Select a role, then use the switches to grant or remove each permission.</p>
        {!canManageRoles && (
          <div style={{ marginTop: "10px", padding: "8px 12px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", fontSize: "0.85rem", color: "#475569", fontWeight: 500 }}>
            ℹ️ Read-Only Mode: You have permission to view roles and permissions. Editing permissions requires "MANAGE_PERMISSIONS".
          </div>
        )}
      </div>

      <div className="role-manager">
        <aside className="role-list">
          {roles.map((item) => (
            <button
              className={item.id === roleId ? "role-choice active" : "role-choice"}
              key={item.id}
              onClick={() => choose(item.id)}
            >
              {item.name}
              <small>{item.description}</small>
            </button>
          ))}
        </aside>

        <div className="permission-list">
          {canManageRoles && (
            <form className="permission-create" onSubmit={addPermission}>
              <input
                placeholder="New permission"
                value={permissionName}
                onChange={(e) => setPermissionName(e.target.value)}
                required
              />
              <input
                placeholder="Description"
                value={permissionDescription}
                onChange={(e) => setPermissionDescription(e.target.value)}
              />
              <button className="text-button">Add permission</button>
            </form>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2>{role?.name || "Select a role"}</h2>
            {isSuperAdmin && role &&
              !["SUPER_ADMIN", "ADMIN", "EMPLOYEE"].includes(role.name) && (
                <button
                  type="button"
                  className="text-button danger-button"
                  style={{ color: "#dc3545" }}
                  onClick={removeRole}
                >
                  Delete role
                </button>
              )}
          </div>

          {paginatedPermissions.map((permission) => (
            <label className={`permission-row ${!canManageRoles ? "opacity-75 cursor-not-allowed" : ""}`} key={permission.id}>
              <span>
                <strong>{permission.name.replaceAll("_", " ")}</strong>
                <small>{permission.description}</small>
              </span>
              <input
                type="checkbox"
                checked={selected.includes(permission.name)}
                disabled={!canManageRoles}
                onChange={() => toggle(permission.name)}
              />
              <i />
            </label>
          ))}

          {totalPages > 1 && (
            <div className="pagination-container" style={{ margin: "12px 0" }}>
              <div className="pagination-info">
                Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> -{" "}
                <strong>{Math.min(currentPage * pageSize, permissions.length)}</strong> of{" "}
                <strong>{permissions.length}</strong> permissions
              </div>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  ‹ Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-btn ${p === currentPage ? "active" : ""}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next ›
                </button>
              </div>
            </div>
          )}

          {canManageRoles && (
            <button className="primary-button" onClick={save}>
              Apply permissions
            </button>
          )}
          {message && <p className="success-message">{message}</p>}
        </div>
      </div>
    </DashboardShell>
  );
}
