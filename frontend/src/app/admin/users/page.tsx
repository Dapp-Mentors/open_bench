"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
    Users, Shield, Plus, X, CheckCircle,
    Loader2, RefreshCw, Activity, FolderOpen,
    ChevronDown, ChevronUp, Search, Crown, UserCircle2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectSummary {
    id: string;
    name: string;
    domain: string;
}

interface Membership {
    id: string;
    role: string;
    projectId: string;
    project: ProjectSummary;
}

interface AdminUser {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: string;
    createdAt: string;
    _count: { passkeys: number; accounts: number; tasks: number };
    memberships: Membership[];
    taskCounts: Record<string, number>;
    totalTasks: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
    super_admin: { label: "Super", color: "#00e676", bg: "rgba(0,230,118,0.08)", border: "rgba(0,230,118,0.18)", Icon: Crown },
    admin: { label: "Admin", color: "#ffb300", bg: "rgba(255,179,0,0.08)", border: "rgba(255,179,0,0.18)", Icon: Shield },
    user: { label: "User", color: "#4da6ff", bg: "rgba(77,166,255,0.08)", border: "rgba(77,166,255,0.18)", Icon: UserCircle2 },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
    approved: { label: "Approved", color: "#00e676" },
    rejected: { label: "Rejected", color: "#ff4444" },
    pipeline_passed: { label: "Passed", color: "#ffb300" },
    pending: { label: "Pending", color: "#8899aa" },
    pipeline_running: { label: "Running", color: "#4da6ff" },
};

function initials(name: string | null, email: string) {
    const s = name ?? email;
    return s.split(/[\s@]/)[0]?.[0]?.toUpperCase() ?? "?";
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user }: { user: AdminUser }) {
    const meta = ROLE_META[user.role] ?? ROLE_META.user;
    return (
        <div
            className="relative flex-shrink-0 w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold"
            style={{ background: meta.bg, border: `1.5px solid ${meta.border}`, color: meta.color }}
        >
            {user.image ? (
                <img src={user.image} alt="" className="w-full h-full object-cover" />
            ) : (
                initials(user.name, user.email)
            )}
        </div>
    );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
    const m = ROLE_META[role] ?? ROLE_META.user;
    return (
        <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider"
            style={{ background: m.bg, border: `1px solid ${m.border}`, color: m.color }}
        >
            <m.Icon size={9} />
            {m.label}
        </span>
    );
}

// ─── Task pill ────────────────────────────────────────────────────────────────

function TaskPill({ status, count }: { status: string; count: number }) {
    if (!count) return null;
    const m = STATUS_META[status];
    if (!m) return null;
    return (
        <span
            title={`${m.label}: ${count}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono"
            style={{ background: `${m.color}14`, color: m.color, border: `1px solid ${m.color}28` }}
        >
            {m.label} <strong>{count}</strong>
        </span>
    );
}

// ─── Role Selector ────────────────────────────────────────────────────────────
// Rendered via a portal-style fixed overlay to avoid stacking-context clipping

function RoleSelector({
    userId, currentRole, onRoleChange, disabled,
}: {
    userId: string; currentRole: string;
    onRoleChange: (id: string, role: string) => Promise<void>;
    disabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

    // Only show user and admin as assignable roles (never super_admin)
    const roles = Object.entries(ROLE_META)
        .filter(([value]) => value !== "super_admin")
        .map(([value, m]) => ({ value, ...m }));

    const handleOpen = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setAnchor({ top: rect.bottom + window.scrollY + 6, right: window.innerWidth - rect.right });
        setOpen(o => !o);
    };

    const handleSelect = async (role: string) => {
        if (role === currentRole) { setOpen(false); return; }
        setSaving(true);
        setOpen(false);
        await onRoleChange(userId, role);
        setSaving(false);
    };

    const m = ROLE_META[currentRole] ?? ROLE_META.user;

    return (
        <>
            <button
                onClick={handleOpen}
                disabled={disabled || saving}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold transition-all"
                style={{
                    background: m.bg,
                    border: `1px solid ${m.border}`,
                    color: m.color,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                    minWidth: 110,
                }}
            >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <m.Icon size={11} />}
                <span className="flex-1 text-left">{m.label}</span>
                <ChevronDown size={10} />
            </button>

            {open && anchor && (
                <>
                    <div className="fixed inset-0 z-[999]" onClick={() => setOpen(false)} />
                    <div
                        className="fixed z-[1000] rounded-xl overflow-hidden py-1"
                        style={{
                            top: anchor.top,
                            right: anchor.right,
                            background: "#1a1f2e",
                            border: "1px solid rgba(255,255,255,0.1)",
                            boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
                            minWidth: 160,
                        }}
                    >
                        {roles.map(r => (
                            <button
                                key={r.value}
                                onClick={() => handleSelect(r.value)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[11px] font-mono text-left transition-colors"
                                style={{
                                    color: r.value === currentRole ? r.color : "rgba(255,255,255,0.7)",
                                    background: r.value === currentRole ? r.bg : "transparent",
                                }}
                                onMouseEnter={e => { if (r.value !== currentRole) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = r.value === currentRole ? r.bg : "transparent"; }}
                            >
                                {r.value === currentRole
                                    ? <CheckCircle size={12} style={{ color: r.color }} />
                                    : <r.Icon size={12} style={{ opacity: 0.4 }} />
                                }
                                <span className="font-semibold">{r.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

// ─── Project membership ───────────────────────────────────────────────────────

function ProjectMembership({
    memberships, userId, onAdd, onRemove, disabled,
}: {
    memberships: Membership[];
    userId: string;
    onAdd: (userId: string, projectId: string) => Promise<void>;
    onRemove: (userId: string, projectId: string) => Promise<void>;
    disabled: boolean;
}) {
    const [adding, setAdding] = useState(false);
    const [projects, setProjects] = useState<ProjectSummary[]>([]);
    const [selected, setSelected] = useState("");
    const [loadingP, setLoadingP] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);

    const openAdd = async () => {
        setAdding(true);
        setLoadingP(true);
        try {
            const res = await fetch("/api/projects");
            const all: ProjectSummary[] = await res.json();
            const ids = new Set(memberships.map(m => m.projectId));
            setProjects(all.filter(p => !ids.has(p.id)));
        } catch { setProjects([]); }
        finally { setLoadingP(false); }
    };

    const handleAdd = async () => {
        if (!selected) return;
        await onAdd(userId, selected);
        setAdding(false); setSelected("");
    };

    const handleRemove = async (pid: string) => {
        setRemoving(pid);
        await onRemove(userId, pid);
        setRemoving(null);
    };

    return (
        <div className="space-y-1.5">
            {memberships.length === 0 && !adding && (
                <p className="text-[11px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
                    No project memberships yet.
                </p>
            )}

            {memberships.map(m => (
                <div
                    key={m.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-mono"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                    <FolderOpen size={12} style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
                    <span className="truncate flex-1" title={m.project.name}>{m.project.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }}>
                        {m.project.domain}
                    </span>
                    <button
                        onClick={() => handleRemove(m.projectId)}
                        disabled={disabled || removing === m.projectId}
                        className="flex-shrink-0 p-0.5 rounded transition-colors"
                        style={{ color: "rgba(255,255,255,0.25)" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#ff4444")}
                        onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
                    >
                        {removing === m.projectId
                            ? <Loader2 size={11} className="animate-spin" />
                            : <X size={11} />
                        }
                    </button>
                </div>
            ))}

            {adding ? (
                <div className="flex items-center gap-2 mt-1">
                    <select
                        value={selected}
                        onChange={e => setSelected(e.target.value)}
                        disabled={loadingP}
                        className="flex-1 px-2.5 py-1.5 rounded-lg text-[11px] font-mono"
                        style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "rgba(255,255,255,0.8)",
                        }}
                    >
                        <option value="">{loadingP ? "Loading…" : "Select project…"}</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.domain})</option>
                        ))}
                    </select>
                    <button
                        onClick={handleAdd}
                        disabled={!selected}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-semibold transition-all"
                        style={{
                            background: selected ? "rgba(0,230,118,0.12)" : "rgba(255,255,255,0.04)",
                            color: selected ? "#00e676" : "rgba(255,255,255,0.3)",
                            border: `1px solid ${selected ? "rgba(0,230,118,0.2)" : "rgba(255,255,255,0.07)"}`,
                        }}
                    >
                        Add
                    </button>
                    <button
                        onClick={() => { setAdding(false); setSelected(""); }}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <button
                    onClick={openAdd}
                    disabled={disabled}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-mono transition-all mt-1"
                    style={{ color: "#4da6ff", opacity: disabled ? 0.4 : 1 }}
                    onMouseEnter={e => !disabled && (e.currentTarget.style.background = "rgba(77,166,255,0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                    <Plus size={12} /> Add to project
                </button>
            )}
        </div>
    );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
    return (
        <div
            className="rounded-xl px-3.5 py-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
            <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                {label}
            </div>
            <div className="font-mono text-base font-bold" style={{ color: color ?? "rgba(255,255,255,0.85)" }}>
                {value}
            </div>
        </div>
    );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
    user, onRoleChange, onAddToProject, onRemoveFromProject, acting,
}: {
    user: AdminUser;
    onRoleChange: (id: string, role: string) => Promise<void>;
    onAddToProject: (id: string, pid: string) => Promise<void>;
    onRemoveFromProject: (id: string, pid: string) => Promise<void>;
    acting: string | null;
}) {
    const [expanded, setExpanded] = useState(false);
    const isActing = acting === user.id;

    const joined = new Date(user.createdAt).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
    });

    const statusEntries = Object.entries(user.taskCounts).filter(([, c]) => c > 0);

    return (
        <div
            className="rounded-2xl overflow-visible transition-all duration-200"
            style={{
                border: `1px solid ${expanded ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)"}`,
                background: expanded ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)",
                position: "relative",
            }}
        >
            {/* ── Header row ── */}
            <div
                className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
                onClick={() => setExpanded(o => !o)}
            >
                <Avatar user={user} />

                {/* Identity */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold truncate max-w-[180px]" style={{ color: "rgba(255,255,255,0.9)" }}>
                            {user.name ?? "Unnamed"}
                        </span>
                        <RoleBadge role={user.role} />
                    </div>
                    <div className="text-[11px] font-mono truncate mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {user.email}
                    </div>
                </div>

                {/* Tasks */}
                <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
                    <Activity size={13} style={{ color: "rgba(255,255,255,0.25)" }} />
                    <span className="text-xs font-mono font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {user.totalTasks}
                    </span>
                </div>

                {/* Status pills (lg+) */}
                <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
                    {statusEntries.map(([s, c]) => <TaskPill key={s} status={s} count={c} />)}
                </div>

                {/* Role selector — stopPropagation so click doesn't toggle row */}
                <div className="hidden sm:block flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <RoleSelector
                        userId={user.id}
                        currentRole={user.role}
                        onRoleChange={onRoleChange}
                        disabled={isActing}
                    />
                </div>

                <div style={{ color: "rgba(255,255,255,0.25)" }}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {/* ── Expanded panel ── */}
            {expanded && (
                <div
                    className="border-t px-4 py-5 space-y-5"
                    style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}
                >
                    {/* Mobile role selector */}
                    <div className="sm:hidden">
                        <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Role</div>
                        <div onClick={e => e.stopPropagation()}>
                            <RoleSelector userId={user.id} currentRole={user.role} onRoleChange={onRoleChange} disabled={isActing} />
                        </div>
                    </div>

                    {/* Task stats */}
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider mb-2.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                            Task Breakdown
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <StatCard label="Total" value={user.totalTasks} />
                            <StatCard label="Approved" value={user.taskCounts.approved ?? 0} color="#00e676" />
                            <StatCard label="Rejected" value={user.taskCounts.rejected ?? 0} color="#ff4444" />
                            <StatCard label="Pending" value={user.taskCounts.pending ?? 0} color="#ffb300" />
                        </div>
                        {statusEntries.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3 lg:hidden">
                                {statusEntries.map(([s, c]) => <TaskPill key={s} status={s} count={c} />)}
                            </div>
                        )}
                    </div>

                    {/* Project memberships */}
                    <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider mb-2.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                            Project Memberships
                        </div>
                        <ProjectMembership
                            memberships={user.memberships}
                            userId={user.id}
                            onAdd={onAddToProject}
                            onRemove={onRemoveFromProject}
                            disabled={isActing}
                        />
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="text-[10px] font-mono uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Joined</div>
                            <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.7)" }}>{joined}</span>
                        </div>
                        <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="text-[10px] font-mono uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Passkeys</div>
                            <span className="text-xs font-mono font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>{user._count.passkeys}</span>
                        </div>
                        <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            <div className="text-[10px] font-mono uppercase tracking-wider mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Accounts</div>
                            <span className="text-xs font-mono font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>{user._count.accounts}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
    const { data: session, status: authStatus } = useSession();
    const router = useRouter();

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [error, setError] = useState<string | null>(null);

    const isSuperAdmin = session?.user?.role === "super_admin";

    const fetchUsers = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/admin/users");
            if (!res.ok) {
                if (res.status === 403) { router.push("/unauthorized"); return; }
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load users");
            setUsers([]);
        } finally { setLoading(false); }
    }, [router]);

    useEffect(() => {
        if (authStatus === "unauthenticated") { router.push("/login"); return; }
        if (authStatus === "authenticated" && isSuperAdmin) fetchUsers();
    }, [authStatus, isSuperAdmin, fetchUsers, router]);

    const handleRoleChange = async (userId: string, newRole: string) => {
        setActing(userId);
        try {
            const res = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: userId, role: newRole }),
            });
            if (res.ok) {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
            } else {
                const d = await res.json();
                setError(d.error ?? "Failed to update role");
            }
        } catch { setError("Network error"); }
        finally { setActing(null); }
    };

    const handleAddToProject = async (userId: string, projectId: string) => {
        setActing(userId);
        try {
            const res = await fetch("/api/admin/projects/members", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, projectId }),
            });
            if (res.ok) {
                const m = await res.json();
                setUsers(prev => prev.map(u =>
                    u.id === userId
                        ? { ...u, memberships: [...u.memberships, { id: m.id, role: m.role, projectId: m.project.id, project: m.project }] }
                        : u
                ));
            } else {
                const d = await res.json();
                setError(d.error ?? "Failed to add to project");
            }
        } catch { setError("Network error"); }
        finally { setActing(null); }
    };

    const handleRemoveFromProject = async (userId: string, projectId: string) => {
        setActing(userId);
        try {
            const res = await fetch(
                `/api/admin/projects/members?userId=${encodeURIComponent(userId)}&projectId=${encodeURIComponent(projectId)}`,
                { method: "DELETE" }
            );
            if (res.ok) {
                setUsers(prev => prev.map(u =>
                    u.id === userId
                        ? { ...u, memberships: u.memberships.filter(m => m.projectId !== projectId) }
                        : u
                ));
            } else {
                const d = await res.json();
                setError(d.error ?? "Failed to remove from project");
            }
        } catch { setError("Network error"); }
        finally { setActing(null); }
    };

    const filtered = users.filter(u => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (u.name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
    });

    if (authStatus === "loading") {
        return (
            <div className="max-w-4xl mx-auto px-6 py-10">
                <div className="text-center py-20 font-mono text-sm animate-pulse" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Loading…
                </div>
            </div>
        );
    }

    if (authStatus === "authenticated" && !isSuperAdmin) {
        router.push("/unauthorized"); return null;
    }

    const totalTasks = users.reduce((s, u) => s + u.totalTasks, 0);
    const adminCount = users.filter(u => u.role === "admin" || u.role === "super_admin").length;

    return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                        Admin Panel
                    </div>
                    <h1 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: "rgba(255,255,255,0.9)", letterSpacing: "-0.02em" }}>
                        <Users size={22} style={{ color: "#00e676" }} />
                        User Management
                    </h1>
                    <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                        Manage users, roles, and project memberships.
                    </p>
                </div>
                <button
                    onClick={fetchUsers}
                    disabled={loading}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono transition-all"
                    style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.5)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                >
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    Refresh
                </button>
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div
                    className="mb-5 px-4 py-3 rounded-xl flex items-center gap-2.5 text-xs font-mono"
                    style={{ background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)", color: "#ff4444" }}
                >
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError(null)}>
                        <X size={13} style={{ color: "rgba(255,255,255,0.35)" }} />
                    </button>
                </div>
            )}

            {/* ── Stats ── */}
            {!loading && users.length > 0 && (
                <div className="flex flex-wrap gap-2.5 mb-6">
                    {[
                        { icon: <Users size={14} />, value: `${users.length} users`, color: "rgba(255,255,255,0.5)" },
                        { icon: <Shield size={14} />, value: `${adminCount} admins`, color: "#ffb300" },
                        { icon: <Activity size={14} />, value: `${totalTasks} tasks`, color: "rgba(255,255,255,0.5)" },
                    ].map(({ icon, value, color }, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color }}
                        >
                            <span style={{ opacity: 0.6 }}>{icon}</span>
                            {value}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Search ── */}
            <div className="relative mb-5">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.25)" }} />
                <input
                    type="text"
                    placeholder="Search by name, email, or role…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm font-mono outline-none transition-all"
                    style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.8)",
                    }}
                    onFocus={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.18)")}
                    onBlur={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.08)")}
                />
            </div>

            {/* ── Table header (desktop) ── */}
            {!loading && filtered.length > 0 && (
                <div className="hidden md:grid grid-cols-[auto_1fr_80px_180px_36px] items-center gap-4 px-4 mb-2">
                    {["", "User", "Tasks", "Role", ""].map((h, i) => (
                        <div key={i} className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
                            {h}
                        </div>
                    ))}
                </div>
            )}

            {/* ── List ── */}
            {loading ? (
                <div className="text-center py-20 font-mono text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                    <Loader2 size={20} className="animate-spin mx-auto mb-3" />
                    Loading users…
                </div>
            ) : filtered.length === 0 ? (
                <div
                    className="text-center py-24 rounded-2xl"
                    style={{ border: "1px dashed rgba(255,255,255,0.08)" }}
                >
                    <Users size={32} className="mx-auto mb-4" style={{ color: "rgba(255,255,255,0.12)" }} />
                    <p className="font-mono text-sm mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {search ? "No users match your search" : "No users found"}
                    </p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                        {search ? "Try adjusting the search term." : "Users will appear here once they sign in."}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(u => (
                        <UserRow
                            key={u.id}
                            user={u}
                            onRoleChange={handleRoleChange}
                            onAddToProject={handleAddToProject}
                            onRemoveFromProject={handleRemoveFromProject}
                            acting={acting}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}