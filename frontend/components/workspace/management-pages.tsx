"use client";

import { useEffect, useState } from "react";
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
        <h1>Designations</h1>
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
  const [permissionName, setPermissionName] = useState("");
  const [permissionDescription, setPermissionDescription] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 8;
  const totalPages = Math.ceil(permissions.length / pageSize);
  const paginatedPermissions = permissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const load = () =>
    session?.token &&
    getRoles(session.token).then(({ roles, permissions }) => {
      setRoles(roles);
      setPermissions(permissions);
      if (!roleId && roles[0]) {
        setRoleId(roles[0].id);
        setSelected(roles[0].permissionIds);
      }
    });

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

  const toggle = (name: string) =>
    setSelected((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );

  const save = async () => {
    if (!session?.token || !roleId) return;
    await saveRolePermissions(
      roleId,
      permissions
        .filter((p) => selected.includes(p.name))
        .map((p) => p.id),
      session.token
    );
    setMessage("Permissions saved.");
    load();
  };

  const addPermission = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.token) return;
    await createPermission(
      permissionName,
      permissionDescription,
      session.token
    );
    setPermissionName("");
    setPermissionDescription("");
    setMessage("Permission added.");
    load();
  };

  const removeRole = async () => {
    if (
      !session?.token ||
      !roleId ||
      !role ||
      !confirm(`Delete role "${role.name}"?`)
    )
      return;
    await deleteRole(roleId, session.token);
    setRoleId(undefined);
    setMessage(`Role "${role.name}" deleted.`);
    load();
  };

  return (
    <DashboardShell>
      <div className="welcome">
        <p className="eyebrow">ADMINISTRATION</p>
        <h1>Roles & permissions</h1>
        <p>Select a role, then use the switches to grant or remove each permission.</p>
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

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2>{role?.name || "Select a role"}</h2>
            {role &&
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
            <label className="permission-row" key={permission.id}>
              <span>
                <strong>{permission.name.replaceAll("_", " ")}</strong>
                <small>{permission.description}</small>
              </span>
              <input
                type="checkbox"
                checked={selected.includes(permission.name)}
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

          <button className="primary-button" onClick={save}>
            Apply permissions
          </button>
          {message && <p className="success-message">{message}</p>}
        </div>
      </div>
    </DashboardShell>
  );
}
