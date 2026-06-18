"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ArrowLeft, Plus, Upload, Pencil, Trash2, AlertTriangle, X } from "lucide-react";
import { TaskRow, PIPELINE_DEF } from "@/components/TaskRow";
import type { ProjectTask } from "@/components/TaskRow";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description: string;
  domain: string;
  createdAt: string;
  tasks: ProjectTask[];
}

// ─── Domains ──────────────────────────────────────────────────────────────────

const DOMAINS = [
    "Software Engineering",
    "Sys-Admin",
    "Security",
    "Scientific Computing",
    "Finance",
    "DevOps",
];

// ─── Delete modal ─────────────────────────────────────────────────────────────

function DeleteModal({
    projectName,
    onConfirm,
    onCancel,
    deleting,
}: {
    projectName: string;
    onConfirm: () => void;
    onCancel: () => void;
    deleting: boolean;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.7)" }}
        >
            <div
                className="w-full max-w-md rounded-xl p-6"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
                <div className="flex items-start gap-4 mb-5">
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                            background: "rgba(255,68,68,0.1)",
                            border: "1px solid rgba(255,68,68,0.25)",
                        }}
                    >
                        <AlertTriangle className="w-5 h-5" style={{ color: "var(--red)" }} />
                    </div>
                    <div>
                        <h2
                            className="font-mono text-sm font-semibold mb-1"
                            style={{ color: "var(--text)" }}
                        >
                            Delete project
                        </h2>
                        <p
                            className="font-mono text-xs leading-relaxed"
                            style={{ color: "var(--subtle)" }}
                        >
                            This will permanently delete{" "}
                            <span style={{ color: "var(--text)" }}>{projectName}</span> and
                            all tasks inside it. There's no undo.
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={onCancel}
                        disabled={deleting}
                        className="bench-btn-ghost px-4 py-2 rounded text-xs font-mono disabled:opacity-40"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={deleting}
                        className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                            background: "rgba(255,68,68,0.1)",
                            border: "1px solid rgba(255,68,68,0.3)",
                            color: "var(--red)",
                        }}
                    >
                        {deleting ? (
                            <>
                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                Deleting…
                            </>
                        ) : (
                            "Delete project"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
    project,
    onSave,
    onCancel,
    saving,
}: {
    project: { name: string; description: string; domain: string };
    onSave: (name: string, description: string, domain: string) => void;
    onCancel: () => void;
    saving: boolean;
}) {
    const [name, setName] = useState(project.name);
    const [description, setDescription] = useState(project.description);
    const [domain, setDomain] = useState(project.domain);

    const canSave =
        name.trim().length > 0 &&
        description.trim().length > 0 &&
        domain.length > 0 &&
        !saving;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.7)" }}
        >
            <div
                className="w-full max-w-lg rounded-xl p-6"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="section-label mb-1">Admin</div>
                        <h2
                            className="font-mono text-sm font-semibold"
                            style={{ color: "var(--text)" }}
                        >
                            Edit project
                        </h2>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1.5 rounded transition-colors"
                        style={{ color: "var(--subtle)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block section-label mb-2">Project Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={80}
                            className="w-full px-3 py-2.5 rounded text-sm font-mono outline-none"
                            style={{
                                background: "var(--bg)",
                                border: "1px solid var(--border)",
                                color: "var(--text)",
                            }}
                            onFocus={(e) => (e.target.style.borderColor = "rgba(0,230,118,0.4)")}
                            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                        />
                    </div>
                    <div>
                        <label className="block section-label mb-2">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={300}
                            rows={3}
                            className="w-full px-3 py-2.5 rounded text-sm font-mono outline-none resize-none"
                            style={{
                                background: "var(--bg)",
                                border: "1px solid var(--border)",
                                color: "var(--text)",
                            }}
                            onFocus={(e) => (e.target.style.borderColor = "rgba(0,230,118,0.4)")}
                            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                        />
                        <p className="mt-1 text-xs font-mono" style={{ color: "var(--muted)" }}>
                            {description.length}/300
                        </p>
                    </div>
                    <div>
                        <label className="block section-label mb-2">Domain</label>
                        <div className="flex flex-wrap gap-2">
                            {DOMAINS.map((d) => {
                                const active = domain === d;
                                return (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setDomain(d)}
                                        className="px-3 py-1.5 rounded text-xs font-mono transition-all"
                                        style={{
                                            background: active ? "rgba(0,230,118,0.1)" : "var(--bg)",
                                            border: active
                                                ? "1px solid rgba(0,230,118,0.4)"
                                                : "1px solid var(--border)",
                                            color: active ? "var(--green)" : "var(--subtle)",
                                        }}
                                    >
                                        {d}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-6">
                    <button
                        onClick={onCancel}
                        disabled={saving}
                        className="bench-btn-ghost px-4 py-2 rounded text-xs font-mono disabled:opacity-40"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(name.trim(), description.trim(), domain)}
                        disabled={!canSave}
                        className="bench-btn-primary flex items-center gap-2 px-4 py-2 rounded text-xs font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <>
                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                Saving…
                            </>
                        ) : (
                            "Save changes"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "super_admin";

  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) {
      setProject(await res.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // Poll while any task is active
  useEffect(() => {
    if (!project) return;
    const hasActive = project.tasks.some(
      (t) => t.status === "pending" || t.status === "pipeline_running"
    );
    if (!hasActive) return;
    const timer = setInterval(fetchProject, 2500);
    return () => clearInterval(timer);
  }, [project, fetchProject]);

  async function handleDelete() {
    if (!project) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        window.location.href = "/projects";
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Delete failed.");
      }
    } catch {
      alert("Network error. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(name: string, description: string, domain: string) {
    if (!project) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, domain }),
      });
      if (res.ok) {
        setProject((prev) => prev ? { ...prev, name, description, domain } : prev);
        setShowEdit(false);
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Save failed.");
      }
    } catch {
      alert("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleTaskDeleted(taskId: string) {
    setProject((prev) => prev ? {
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId),
    } : prev);
  }

  const approvedCount = project?.tasks.filter((t) => t.status === "approved").length ?? 0;
  const pendingCount = project?.tasks.filter(
    (t) => t.status === "pending" || t.status === "pipeline_running"
  ).length ?? 0;
  const rejectedCount = project?.tasks.filter((t) => t.status === "rejected").length ?? 0;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 font-mono text-sm" style={{ color: "var(--subtle)" }}>
        <span className="animate-pulse">▋</span> Loading…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 font-mono text-sm" style={{ color: "var(--red)" }}>
        Project not found.
      </div>
    );
  }

  return (
    <>
      {showDelete && project && (
        <DeleteModal
          projectName={project.name}
          onConfirm={handleDelete}
          onCancel={() => !deleting && setShowDelete(false)}
          deleting={deleting}
        />
      )}
      {showEdit && project && (
        <EditModal
          project={project}
          onSave={handleSave}
          onCancel={() => !saving && setShowEdit(false)}
          saving={saving}
        />
      )}

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Back */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-mono mb-6 transition-colors"
          style={{ color: "var(--subtle)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Projects
        </Link>

        {/* Project header */}
        <div className="flex flex-col sm:flex-row items-start justify-between mb-2 gap-4">
          <div>
            <div className="section-label mb-2">Project</div>
            <h1 className="font-display text-2xl font-bold mb-1" style={{ color: "var(--text)" }}>
              {project.name}
            </h1>
            <p className="text-sm" style={{ color: "var(--subtle)", maxWidth: "520px", lineHeight: 1.6 }}>
              {project.description}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowEdit(true)}
                  title="Edit project"
                  className="bench-btn-ghost inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs w-full sm:w-auto justify-center"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
                <button
                  onClick={() => setShowDelete(true)}
                  title="Delete project"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded text-xs w-full sm:w-auto justify-center"
                  style={{
                    background: "rgba(255,68,68,0.1)",
                    border: "1px solid rgba(255,68,68,0.2)",
                    color: "var(--red)",
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </>
            )}
            <Link
              href={`/projects/${project.id}/submit`}
              className="bench-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs w-full sm:w-auto justify-center"
            >
              <Upload className="w-3.5 h-3.5" />
              Add Task
            </Link>
          </div>
        </div>

        {/* Domain tag */}
        <div className="mb-6">
          <span
            className="font-mono text-xs px-2 py-1 rounded"
            style={{ background: "var(--muted)", color: "var(--subtle)", border: "1px solid var(--border)" }}
          >
            {project.domain}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Total Tasks", value: project.tasks.length, color: "var(--text)" },
            { label: "Approved", value: approvedCount, color: "var(--green)" },
            { label: "In Pipeline", value: pendingCount, color: "var(--blue)" },
            { label: "Rejected", value: rejectedCount, color: "var(--red)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bench-card rounded-lg px-4 py-3">
              <div className="section-label mb-1">{label}</div>
              <div className="font-display font-bold text-2xl" style={{ color }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Tasks */}
        <div className="section-label mb-3">Tasks</div>
        {project.tasks.length === 0 ? (
          <div
            className="text-center py-16 border rounded-lg"
            style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
          >
            <p className="font-mono text-sm mb-3" style={{ color: "var(--subtle)" }}>
              No tasks yet. Submit a .zip built to the Harbor spec.
            </p>
            <Link
              href={`/projects/${project.id}/submit`}
              className="bench-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Submit first task
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {project.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                projectId={project.id}
                onDeleted={handleTaskDeleted}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}