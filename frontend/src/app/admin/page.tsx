"use client";

import Link from "next/link";
import {
    CheckCircle, XCircle, RefreshCw, ShieldCheck,
    ExternalLink, Clock, ListFilter, Undo2, Loader2, Wifi, WifiOff,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ScoreDisplay } from "@/components/ScoreDisplay";
import { PipelineStages } from "@/components/PipelineStages";
import { SiaProof } from "@/components/admin/SiaProof";
import { BenchmarkCards } from "@/components/admin/BenchmarkCards";
import type { Task } from "@/lib/types";
import { AdminProvider, useAdmin, type AdminTab } from "@/lib/admin-context";

// ─── Tab configuration ───────────────────────────────────────────────────────

const TABS: { key: AdminTab; label: string; description: string }[] = [
    { key: "awaiting_review", label: "Awaiting Review", description: "Pipeline-passed tasks needing human sign-off" },
    { key: "all", label: "All Tasks", description: "Every task across every project" },
    { key: "approved", label: "Approved", description: "Tasks that have been human-approved" },
    { key: "rejected", label: "Rejected", description: "Tasks that were rejected during review" },
];

// ─── Inner component (consumes context) ──────────────────────────────────────

function AdminPageInner() {
    const {
        tasks, stats, loading, activeTab, acting, expanded, sseConnected,
        setActiveTab, setExpanded, refresh, approveTask, rejectTask, revertTask,
    } = useAdmin();

    return (
        <div className="max-w-5xl mx-auto px-6 py-10">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <div className="section-label mb-2">Admin</div>
                    <h1 className="font-display text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text)" }}>
                        <ShieldCheck className="w-5 h-5 flex-shrink-0" style={{ color: "var(--green)" }} />
                        Task Review Queue
                    </h1>
                    <p className="text-xs mt-1.5" style={{ color: "var(--subtle)" }}>
                        View and manage tasks across all pipeline stages.
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    {/* SSE connection status indicator */}
                    <div
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono"
                        title={sseConnected ? "Live updates active" : "Live updates offline — using 5 min polling fallback"}
                        style={{
                            background: sseConnected
                                ? "rgba(0,230,118,0.06)"
                                : "rgba(140,148,168,0.06)",
                            border: sseConnected
                                ? "1px solid rgba(0,230,118,0.15)"
                                : "1px solid rgba(140,148,168,0.15)",
                            color: sseConnected ? "var(--green)" : "var(--subtle)",
                        }}
                    >
                        {sseConnected ? (
                            <Wifi className="w-3 h-3" />
                        ) : (
                            <WifiOff className="w-3 h-3" />
                        )}
                        {sseConnected ? "Live" : "Polling"}
                    </div>

                    <button
                        onClick={refresh}
                        className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Platform stats */}
            {stats && (
                <div className="mb-8">
                    <BenchmarkCards stats={stats} />
                </div>
            )}

            {/* Tabs */}
            <div className="mb-6">
                <div className="flex items-center gap-1 mb-3 flex-wrap">
                    <ListFilter className="w-3.5 h-3.5" style={{ color: "var(--subtle)" }} />
                    <span className="section-label ml-1">Filter</span>
                </div>
                <div
                    className="flex flex-wrap rounded-lg p-1 gap-1"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className="px-4 py-2 rounded-md text-xs font-mono transition-all"
                                style={{
                                    background: isActive ? "var(--bg, #0a0b0d)" : "transparent",
                                    color: isActive ? "var(--text)" : "var(--subtle)",
                                    border: isActive ? "1px solid var(--border)" : "1px solid transparent",
                                    boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                                }}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs mt-2" style={{ color: "var(--subtle)" }}>
                    {TABS.find((t) => t.key === activeTab)?.description ?? ""}
                </p>
            </div>

            {/* Queue */}
            <div className="section-label mb-3">
                {activeTab === "all" ? "All Tasks" :
                    activeTab === "awaiting_review" ? "Review Queue" :
                        activeTab === "approved" ? "Approved Tasks" :
                            "Rejected Tasks"}
            </div>

            {loading ? (
                <div className="text-center py-12 font-mono text-sm" style={{ color: "var(--subtle)" }}>
                    <span className="animate-pulse">▋</span> Loading…
                </div>
            ) : tasks.length === 0 ? (
                <div
                    className="text-center py-20 border rounded-lg"
                    style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
                >
                    <CheckCircle className="w-8 h-8 mx-auto mb-4" style={{ color: "var(--green)" }} />
                    <p className="font-mono text-sm mb-1" style={{ color: "var(--text)" }}>
                        {activeTab === "awaiting_review"
                            ? "Queue is empty"
                            : activeTab === "approved"
                                ? "No approved tasks"
                                : activeTab === "rejected"
                                    ? "No rejected tasks"
                                    : "No tasks found"}
                    </p>
                    <p className="text-xs" style={{ color: "var(--subtle)" }}>
                        {activeTab === "awaiting_review"
                            ? "All pipeline-passed tasks have been reviewed. Check back later."
                            : activeTab === "all"
                                ? "Tasks will appear here once submitted through the pipeline."
                                : "No tasks match this filter."}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tasks.map((task) => {
                        const isExpanded = expanded === task.id;
                        const isActing = acting === task.id;

                        return (
                            <div
                                key={task.id}
                                className="bench-card rounded-lg overflow-hidden"
                                style={{ border: "1px solid var(--border)" }}
                            >
                                {/* Row */}
                                <div
                                    className="flex items-center justify-between px-5 py-4 cursor-pointer"
                                    onClick={() => setExpanded(isExpanded ? null : task.id)}
                                >
                                    <div className="flex items-center gap-4 min-w-0">
                                        {/* Status icon */}
                                        <div
                                            className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                                            style={{
                                                background: task.status === "approved"
                                                    ? "rgba(0,230,118,0.08)"
                                                    : task.status === "rejected"
                                                        ? "rgba(255,68,68,0.08)"
                                                        : "rgba(251,191,36,0.08)",
                                                border: task.status === "approved"
                                                    ? "1px solid rgba(0,230,118,0.2)"
                                                    : task.status === "rejected"
                                                        ? "1px solid rgba(255,68,68,0.2)"
                                                        : "1px solid rgba(251,191,36,0.2)",
                                            }}
                                        >
                                            {task.status === "approved" ? (
                                                <CheckCircle className="w-4 h-4" style={{ color: "var(--green)" }} />
                                            ) : task.status === "rejected" ? (
                                                <XCircle className="w-4 h-4" style={{ color: "var(--red)" }} />
                                            ) : (
                                                <Clock className="w-4 h-4" style={{ color: "var(--amber)" }} />
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <p className="font-medium text-sm mb-0.5" style={{ color: "var(--text)" }}>
                                                {task.title}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-3 text-xs font-mono" style={{ color: "var(--subtle)" }}>
                                                <span
                                                    className="px-2 py-0.5 rounded"
                                                    style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
                                                >
                                                    {task.domain}
                                                </span>
                                                <span>{task.language}</span>
                                                <Link
                                                    href={`/projects/${task.projectId}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1 hover:underline"
                                                    style={{ color: "var(--blue)" }}
                                                >
                                                    Project <ExternalLink className="w-3 h-3" />
                                                </Link>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right side */}
                                    <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                                        <div className="text-right hidden sm:block">
                                            <div className="section-label mb-0.5">Quality</div>
                                            <ScoreDisplay score={task.qualityScore} size="sm" />
                                        </div>

                                        <StatusBadge status={task.status} />

                                        {/* Sia status badge (only show if failed) */}
                                        {task.status === "pipeline_passed" && task.siaStatus === "failed" && (
                                            <div className="flex items-center gap-1.5 hidden sm:flex" onClick={(e) => e.stopPropagation()}>
                                                <span
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono"
                                                    style={{
                                                        background: "rgba(255,68,68,0.08)",
                                                        border: "1px solid rgba(255,68,68,0.2)",
                                                        color: "var(--red)",
                                                    }}
                                                >
                                                    <XCircle className="w-3 h-3" />
                                                    Sia failed
                                                </span>
                                            </div>
                                        )}
                                        {/* Revert button — approved/rejected tasks */}
                                        {(task.status === "approved" || task.status === "rejected") && (
                                            <div className="flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    disabled={isActing}
                                                    onClick={() => revertTask(task)}
                                                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-mono transition-all"
                                                    style={{
                                                        background: "rgba(140,148,168,0.08)",
                                                        color: "var(--subtle)",
                                                        border: "1px solid rgba(140,148,168,0.2)",
                                                        opacity: isActing ? 0.5 : 1,
                                                        cursor: isActing ? "not-allowed" : "pointer",
                                                    }}
                                                >
                                                    <Undo2 className="w-3.5 h-3.5" />
                                                    <span className="hidden sm:inline">Revert</span>
                                                </button>
                                            </div>
                                        )}

                                        {/* Approve / Reject buttons — pipeline_passed tasks only */}
                                        {task.status === "pipeline_passed" && (
                                            <div className="flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    disabled={isActing}
                                                    onClick={() => rejectTask(task)}
                                                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-mono transition-all"
                                                    style={{
                                                        background: "rgba(255,68,68,0.08)",
                                                        color: "var(--red)",
                                                        border: "1px solid rgba(255,68,68,0.2)",
                                                        opacity: isActing ? 0.5 : 1,
                                                        cursor: isActing ? "not-allowed" : "pointer",
                                                    }}
                                                >
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    <span className="hidden sm:inline">Reject</span>
                                                </button>
                                                <button
                                                    disabled={isActing}
                                                    onClick={() => approveTask(task)}
                                                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-mono transition-all"
                                                    style={{
                                                        background: "rgba(0,230,118,0.1)",
                                                        color: "var(--green)",
                                                        border: "1px solid rgba(0,230,118,0.25)",
                                                        opacity: isActing ? 0.5 : 1,
                                                        cursor: isActing ? "not-allowed" : "pointer",
                                                        boxShadow: isActing ? "none" : "0 0 8px rgba(0,230,118,0.1)",
                                                    }}
                                                >
                                                    {isActing ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                    )}
                                                    {isActing ? "Approving…" : "Approve"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded details */}
                                {isExpanded && (
                                    <div
                                        className="border-t px-5 py-5 space-y-5"
                                        style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.01)" }}
                                    >
                                        {/* Task description */}
                                        <div>
                                            <div className="section-label mb-1.5">Description</div>
                                            <p className="text-sm" style={{ color: "var(--subtle)" }}>{task.description}</p>
                                        </div>

                                        {/* Scores row */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            {[
                                                { label: "Quality Score", value: <ScoreDisplay score={task.qualityScore} size="sm" /> },
                                                { label: "Similarity Score", value: <ScoreDisplay score={task.similarityScore} size="sm" /> },
                                                {
                                                    label: "CI Passed",
                                                    value: task.ciPassed == null
                                                        ? <span style={{ color: "var(--subtle)" }}>—</span>
                                                        : task.ciPassed
                                                            ? <span className="font-mono text-sm font-bold" style={{ color: "var(--green)" }}>YES</span>
                                                            : <span className="font-mono text-sm font-bold" style={{ color: "var(--red)" }}>NO</span>,
                                                },
                                                {
                                                    label: "Easiness",
                                                    value: (
                                                        <span
                                                            className="font-mono text-sm font-bold"
                                                            style={{
                                                                color: task.easinessResult === "appropriate"
                                                                    ? "var(--green)"
                                                                    : task.easinessResult === "too_easy"
                                                                        ? "var(--amber)"
                                                                        : "var(--red)",
                                                            }}
                                                        >
                                                            {task.easinessResult ?? "—"}
                                                        </span>
                                                    ),
                                                },
                                            ].map(({ label, value }) => (
                                                <div key={label} className="bench-card rounded-lg px-3 py-2.5">
                                                    <div className="section-label mb-1">{label}</div>
                                                    {value}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Quality details */}
                                        {task.qualityDetails && (
                                            <div>
                                                <div className="section-label mb-1.5">Quality Notes</div>
                                                <p
                                                    className="font-mono text-xs py-2 px-3 rounded"
                                                    style={{
                                                        background: "var(--surface)",
                                                        color: "var(--subtle)",
                                                        border: "1px solid var(--border)",
                                                        whiteSpace: "pre-wrap",
                                                    }}
                                                >
                                                    {task.qualityDetails}
                                                </p>
                                            </div>
                                        )}

                                        {/* Agent quality note */}
                                        {task.agentQualityNote && (
                                            <div>
                                                <div className="section-label mb-1.5">Agent Quality Note</div>
                                                <p
                                                    className="font-mono text-xs py-2 px-3 rounded"
                                                    style={{
                                                        background: "var(--surface)",
                                                        color: "var(--subtle)",
                                                        border: "1px solid var(--border)",
                                                    }}
                                                >
                                                    {task.agentQualityNote}
                                                </p>
                                            </div>
                                        )}

                                        {/* Pipeline stages */}
                                        {task.pipelineLogs && task.pipelineLogs.length > 0 && (
                                            <div>
                                                <div className="section-label mb-2">Pipeline Stages</div>
                                                <PipelineStages logs={task.pipelineLogs} taskStatus={task.status} />
                                            </div>
                                        )}

                                        {/* Sia proof */}
                                        <SiaProof siaHash={task.siaHash} indexdKey={task.indexdKey} />

                                        {/* Docker / config strip */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {[
                                                { label: "Docker Image", value: task.dockerImage },
                                                { label: "Scoring Type", value: task.scoringType },
                                                { label: "Timeout", value: `${(task.timeoutMs / 1000).toFixed(0)}s` },
                                            ].map(({ label, value }) => (
                                                <div key={label} className="bench-card rounded-lg px-3 py-2.5">
                                                    <div className="section-label mb-1">{label}</div>
                                                    <span className="font-mono text-xs" style={{ color: "var(--text)" }}>{value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Bottom actions — revert for approved/rejected */}
                                        {(task.status === "approved" || task.status === "rejected") && (
                                            <div className="flex items-center justify-end gap-2 pt-2">
                                                <button
                                                    disabled={isActing}
                                                    onClick={() => revertTask(task)}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all"
                                                    style={{
                                                        background: "rgba(140,148,168,0.08)",
                                                        color: "var(--subtle)",
                                                        border: "1px solid rgba(140,148,168,0.2)",
                                                        opacity: isActing ? 0.5 : 1,
                                                    }}
                                                >
                                                    <Undo2 className="w-3.5 h-3.5" />
                                                    Revert — Send back to review
                                                </button>
                                            </div>
                                        )}

                                        {/* Bottom actions — approve/reject for pipeline_passed */}
                                        {task.status === "pipeline_passed" && (
                                            <div className="flex items-center justify-end gap-2 pt-2">
                                                <button
                                                    disabled={isActing}
                                                    onClick={() => rejectTask(task)}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all"
                                                    style={{
                                                        background: "rgba(255,68,68,0.08)",
                                                        color: "var(--red)",
                                                        border: "1px solid rgba(255,68,68,0.2)",
                                                        opacity: isActing ? 0.5 : 1,
                                                    }}
                                                >
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    Reject Task
                                                </button>
                                                <button
                                                    disabled={isActing}
                                                    onClick={() => approveTask(task)}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all"
                                                    style={{
                                                        background: "rgba(0,230,118,0.1)",
                                                        color: "var(--green)",
                                                        border: "1px solid rgba(0,230,118,0.25)",
                                                        opacity: isActing ? 0.5 : 1,
                                                        boxShadow: isActing ? "none" : "0 0 12px rgba(0,230,118,0.15)",
                                                    }}
                                                >
                                                    {isActing ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <CheckCircle className="w-3.5 h-3.5" />
                                                    )}
                                                    {isActing ? "Approving…" : "Approve Task"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Exported page (wraps in AdminProvider) ──────────────────────────────────

export default function AdminPage() {
    return (
        <AdminProvider>
            <AdminPageInner />
        </AdminProvider>
    );
}