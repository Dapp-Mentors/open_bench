"use client";

// src/app/projects/page.tsx
//
// Public projects listing — all authenticated users can view.
// Admins (admin + super_admin) also see: New Project, Edit, Delete.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
    Plus,
    RefreshCw,
    FolderOpen,
    ChevronRight,
    Pencil,
    Trash2,
    X,
    AlertTriangle,
} from "lucide-react";

interface ProjectSummary {
    id: string;
    name: string;
    description: string;
    domain: string;
    createdAt: string;
    _count: {
        tasks: number;
        approvedTasks: number;
        pendingTasks: number;
        rejectedTasks: number;
    };
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteModal({
    project,
    onConfirm,
    onCancel,
    deleting,
}: {
    project: ProjectSummary;
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
                {/* Icon + heading */}
                <div className="flex items-start gap-4 mb-5">
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(255,68,68,0.1)", border: "1px solid rgba(255,68,68,0.25)" }}
                    >
                        <AlertTriangle className="w-5 h-5" style={{ color: "var(--red)" }} />
                    </div>
                    <div>
                        <h2 className="font-mono text-sm font-semibold mb-1" style={{ color: "var(--text)" }}>
                            Delete project
                        </h2>
                        <p className="font-mono text-xs leading-relaxed" style={{ color: "var(--subtle)" }}>
                            This will permanently delete{" "}
                            <span style={{ color: "var(--text)" }}>{project.name}</span> and all{" "}
                            <span style={{ color: "var(--red)" }}>
                                {project._count.tasks} task{project._count.tasks !== 1 ? "s" : ""}
                            </span>{" "}
                            inside it. There's no undo.
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
                            <>
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete project
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

const DOMAINS = [
    "Software Engineering",
    "Sys-Admin",
    "Security",
    "Scientific Computing",
    "Finance",
    "DevOps",
];

function EditModal({
    project,
    onSave,
    onCancel,
    saving,
}: {
    project: ProjectSummary;
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
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="section-label mb-1">Admin</div>
                        <h2 className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>
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
                    {/* Name */}
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

                    {/* Description */}
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

                    {/* Domain */}
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

export default function ProjectsPage() {
    const { data: session } = useSession();
    const role = session?.user?.role;
    const isAdmin = role === "admin" || role === "super_admin";

    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [editTarget, setEditTarget] = useState<ProjectSummary | null>(null);
    const [saving, setSaving] = useState(false);

    const fetchProjects = useCallback(async () => {
        setError(null);
        const data = await fetch("/api/projects")
            .then((r) => r.json())
            .catch(() => null);

        if (!data || !Array.isArray(data)) {
            setError("Failed to load projects.");
            setLoading(false);
            return;
        }
        setProjects(data);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    // ── Delete ──────────────────────────────────────────────────────────────

    async function handleDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/projects/${deleteTarget.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
                setDeleteTarget(null);
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

    // ── Edit / save ─────────────────────────────────────────────────────────

    async function handleSave(name: string, description: string, domain: string) {
        if (!editTarget) return;
        setSaving(true);
        try {
            const res = await fetch(`/api/projects/${editTarget.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description, domain }),
            });
            if (res.ok) {
                setProjects((prev) =>
                    prev.map((p) =>
                        p.id === editTarget.id ? { ...p, name, description, domain } : p
                    )
                );
                setEditTarget(null);
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

    // ── Derived stats ───────────────────────────────────────────────────────

    const totalTasks = projects.reduce((s, p) => s + p._count.tasks, 0);
    const totalApproved = projects.reduce((s, p) => s + p._count.approvedTasks, 0);

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <>
            {/* Modals */}
            {deleteTarget && (
                <DeleteModal
                    project={deleteTarget}
                    onConfirm={handleDelete}
                    onCancel={() => !deleting && setDeleteTarget(null)}
                    deleting={deleting}
                />
            )}
            {editTarget && (
                <EditModal
                    project={editTarget}
                    onSave={handleSave}
                    onCancel={() => !saving && setEditTarget(null)}
                    saving={saving}
                />
            )}

            <div className="max-w-5xl mx-auto px-6 py-10">
                {/* Header */}
                <div className="flex items-start justify-between mb-8">
                    <div>
                        <div className="section-label mb-2">Platform</div>
                        <h1
                            className="font-mono text-2xl font-bold"
                            style={{ color: "var(--text)" }}
                        >
                            Projects
                        </h1>
                        <p
                            className="font-mono text-xs mt-1"
                            style={{ color: "var(--subtle)" }}
                        >
                            All benchmark projects on the platform
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setLoading(true);
                                fetchProjects();
                            }}
                            className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Refresh
                        </button>
                        {isAdmin && (
                            <Link
                                href="/projects/new"
                                className="bench-btn-primary flex items-center gap-1.5 px-3 py-2 rounded text-xs"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                New Project
                            </Link>
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                    {[
                        { label: "Total Projects", value: projects.length, color: "var(--text)" },
                        { label: "Total Tasks", value: totalTasks, color: "var(--subtle)" },
                        { label: "Approved", value: totalApproved, color: "var(--green)" },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="bench-card rounded-lg px-4 py-3">
                            <div className="section-label mb-1">{label}</div>
                            <div
                                className="font-mono font-bold text-2xl"
                                style={{ color }}
                            >
                                {loading ? "—" : value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Content */}
                {loading ? (
                    <div
                        className="text-center py-12 font-mono text-sm"
                        style={{ color: "var(--subtle)" }}
                    >
                        Loading…
                    </div>
                ) : error ? (
                    <div
                        className="text-center py-12 font-mono text-sm"
                        style={{ color: "var(--red)" }}
                    >
                        {error}
                    </div>
                ) : projects.length === 0 ? (
                    <div
                        className="text-center py-20 border rounded-lg"
                        style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
                    >
                        <FolderOpen
                            className="w-8 h-8 mx-auto mb-4"
                            style={{ color: "var(--muted)" }}
                        />
                        <p
                            className="font-mono text-sm mb-1"
                            style={{ color: "var(--text)" }}
                        >
                            No projects yet
                        </p>
                        <p className="text-xs mb-5" style={{ color: "var(--subtle)" }}>
                            {isAdmin
                                ? "Create the first project to get started."
                                : "No projects have been created on this platform yet."}
                        </p>
                        {isAdmin && (
                            <Link
                                href="/projects/new"
                                className="bench-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded text-xs"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Create first project
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {projects.map((p) => (
                            <div
                                key={p.id}
                                className="bench-card flex items-center justify-between px-5 py-4 rounded-lg group"
                            >
                                {/* Left: icon + name + description */}
                                <Link
                                    href={`/projects/${p.id}`}
                                    className="flex items-center gap-4 min-w-0 flex-1"
                                >
                                    <div
                                        className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: "rgba(0,230,118,0.08)",
                                            border: "1px solid rgba(0,230,118,0.2)",
                                        }}
                                    >
                                        <FolderOpen
                                            className="w-4 h-4"
                                            style={{ color: "var(--green)" }}
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <p
                                            className="font-mono font-medium text-sm mb-0.5 group-hover:text-white transition-colors"
                                            style={{ color: "var(--text)" }}
                                        >
                                            {p.name}
                                        </p>
                                        <p
                                            className="font-mono text-xs truncate max-w-sm"
                                            style={{ color: "var(--subtle)" }}
                                        >
                                            {p.description}
                                        </p>
                                    </div>
                                </Link>

                                {/* Right: domain + counts + admin actions + chevron */}
                                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                    {/* Domain badge */}
                                    <span
                                        className="font-mono text-xs px-2 py-0.5 rounded hidden md:inline"
                                        style={{
                                            background: "var(--muted)",
                                            color: "var(--subtle)",
                                            border: "1px solid var(--border)",
                                        }}
                                    >
                                        {p.domain}
                                    </span>

                                    {/* Task counts */}
                                    <div className="flex items-center gap-3 font-mono text-xs">
                                        <span style={{ color: "var(--subtle)" }}>
                                            {p._count.tasks} task{p._count.tasks !== 1 ? "s" : ""}
                                        </span>
                                        {p._count.approvedTasks > 0 && (
                                            <span style={{ color: "var(--green)" }}>
                                                {p._count.approvedTasks} approved
                                            </span>
                                        )}
                                        {p._count.pendingTasks > 0 && (
                                            <span style={{ color: "var(--blue)" }}>
                                                {p._count.pendingTasks} running
                                            </span>
                                        )}
                                    </div>

                                    {/* Admin actions — only rendered for admin/super_admin */}
                                    {isAdmin && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setEditTarget(p);
                                                }}
                                                title="Edit project"
                                                className="p-1.5 rounded transition-all"
                                                style={{ color: "var(--muted)" }}
                                                onMouseEnter={(e) =>
                                                    (e.currentTarget.style.color = "var(--blue)")
                                                }
                                                onMouseLeave={(e) =>
                                                    (e.currentTarget.style.color = "var(--muted)")
                                                }
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setDeleteTarget(p);
                                                }}
                                                title="Delete project"
                                                className="p-1.5 rounded transition-all"
                                                style={{ color: "var(--muted)" }}
                                                onMouseEnter={(e) =>
                                                    (e.currentTarget.style.color = "var(--red)")
                                                }
                                                onMouseLeave={(e) =>
                                                    (e.currentTarget.style.color = "var(--muted)")
                                                }
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    <Link href={`/projects/${p.id}`}>
                                        <ChevronRight
                                            className="w-4 h-4"
                                            style={{ color: "var(--muted)" }}
                                        />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}