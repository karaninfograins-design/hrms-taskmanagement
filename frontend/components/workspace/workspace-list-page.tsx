"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { createWorkspaceItem, getWorkspaceList, type WorkspaceListItem } from "@/services/workspace.service";
import { useAuth } from "@/hooks/use-auth";

type WorkspaceListPageProps = {
  resource: "projects" | "sprints" | "backlog" | "admins" | "designations" | "roles" | "settings";
  eyebrow: string;
  title: string;
  description: string;
};

function displayValue(value: WorkspaceListItem[string]) {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Active" : "Inactive";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleDateString();
  return String(value).replaceAll("_", " ");
}

export function WorkspaceListPage({ resource, eyebrow, title, description }: WorkspaceListPageProps) {
  const router = useRouter();
  const { session, isLoading, logout } = useAuth();
  const [items, setItems] = useState<WorkspaceListItem[]>([]);
  const [error, setError] = useState("");
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState<Record<string, string>>({ type: "WEEKLY" });

  useEffect(() => {
    if (!isLoading && !session) router.replace("/");
  }, [isLoading, router, session]);

  useEffect(() => {
    if (!session?.token) return;
    getWorkspaceList(resource, session.token)
      .then(({ items: nextItems }) => setItems(nextItems))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load this section."))
      .finally(() => setIsPageLoading(false));
  }, [resource, session?.token]);

  if (isLoading || !session) return <main className="route-loading">Loading your workspace...</main>;

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.ceil(items.length / pageSize);
  const paginatedItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const columns = items[0] ? Object.keys(items[0]).filter((key) => key !== "id") : [];
  const handleSignOut = () => { logout(); router.replace("/"); };
  const create = async (event: React.FormEvent) => { event.preventDefault(); if (!session?.token || (resource !== "projects" && resource !== "sprints")) return; await createWorkspaceItem(resource, createData, session.token); setShowCreate(false); setCreateData({ type: "WEEKLY" }); setIsPageLoading(true); getWorkspaceList(resource, session.token).then(({ items }) => setItems(items)).finally(() => setIsPageLoading(false)); };

  return <main className="app-shell">
    <Navbar user={session.user} onSignOut={handleSignOut} />
    <div className="dashboard-frame">
      <Sidebar user={session.user} canCreateAdmins={session.user.role === "SUPER_ADMIN"} onSignOut={handleSignOut} />
      <section className="dashboard-content">
        <div className="welcome">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {(resource === "projects" || resource === "sprints") && <><button className="primary-button workspace-add-button" onClick={() => setShowCreate(!showCreate)}>Add {resource === "projects" ? "project" : "sprint"}</button>{showCreate && <form className="management-form" onSubmit={create}><input placeholder="Name" value={createData.name || ""} onChange={(e) => setCreateData({ ...createData, name: e.target.value })} required />{resource === "sprints" && <input placeholder="Project ID" value={createData.projectId || ""} onChange={(e) => setCreateData({ ...createData, projectId: e.target.value })} required />}<input type="date" value={createData.startDate || ""} onChange={(e) => setCreateData({ ...createData, startDate: e.target.value })} required={resource === "sprints"} /><input type="date" value={createData.endDate || ""} onChange={(e) => setCreateData({ ...createData, endDate: e.target.value })} required={resource === "sprints"} /><button className="primary-button">Create</button></form>}</>}
        <div className="workspace-list-card">
          {isPageLoading ? <p className="workspace-list-empty">Loading {title.toLowerCase()}...</p> : error ? <p className="error-message">{error}</p> : items.length === 0 ? <p className="workspace-list-empty">No {title.toLowerCase()} yet.</p> : (
            <>
              <div className="workspace-table-scroll">
                <table className="workspace-table">
                  <thead>
                    <tr>{columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1")}</th>)}</tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((item) => (
                      <tr key={String(item.id)}>
                        {columns.map((column) => <td key={column}>{displayValue(item[column])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="pagination-container">
                  <div className="pagination-info">
                    Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, items.length)}</strong> of <strong>{items.length}</strong> entries
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
            </>
          )}
        </div>
      </section>
    </div>
  </main>;
}
