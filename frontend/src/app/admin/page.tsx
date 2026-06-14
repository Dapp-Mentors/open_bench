"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CheckCircle, XCircle, RefreshCw, ShieldCheck, ExternalLink, Clock } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ScoreDisplay } from "@/components/ScoreDisplay";
import { PipelineStages } from "@/components/PipelineStages";
import { SiaProof } from "@/components/SiaProof";
import { BenchmarkCards } from "@/components/admin/BenchmarkCards";
import type { BenchmarkStats } from "@/components/admin/BenchmarkCards";
import type { Task } from "@/lib/types";

export default function AdminPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [stats, setStats] = useState<BenchmarkStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [acting, setActing] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [tasksData, statsData] = await Promise.all([
                fetch("/api/admin/ready-tasks").then((r) => r.json()),
                fetch("/api/admin/stats").then((r) => r.json()),
            ]);
            setTasks(Array.isArray(tasksData) ? tasksData : []);
            setStats(statsData ?? null);
        } catch {
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function handleApprove(task: Task) {
        setActing(task.id);
        try {
            const res = await fetch(
                `/api/projects/${task.projectId}/tasks/${task.id}/approve`,
                { method: "POST" }
            );
            if (res.ok) {
                setTasks((prev) => prev.filter((t) => t.id !== task.id));
                if (expanded === task.id) setExpanded(null);
            }
        } finally {
            setActing(null);
        }
    }

    async function handleReject(task: Task) {
        setActing(task.id);
        try {
            const res = await fetch(
                `/api/projects/${task.projectId}/tasks/${task.id}/reject`,
                { method: "POST" }
            );
            if (res.ok) {
                setTasks((prev) => prev.filter((t) => t.id !== task.id));
                if (expanded === task.id) setExpanded(null);
            }
        } finally {
            setActing(null);
        }
    }

    return (
        <div className="max-w-5xl mx-auto px-6 py-10">
            {/* Header */}
            <div className="flex items-start justify-between mb-8">
                <div>
                    <div className="section-label mb-2">Admin</div>
                    <h1 className="font-display text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--text)" }}>
                        <ShieldCheck className="w-6 h-6" style={{ color: "var(--green)" }} />
                        Task Review Queue
                    </h1>
                    <p className="text-xs mt-1.5" style={{ color: "var(--subtle)" }}>
                        Tasks that have cleared all automated pipeline checks and are waiting for a human sign-off.
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh
                </button>
            </div>

            {/* Platform stats */}
            {stats && (
                <div className="mb-8">
                    <BenchmarkCards stats={stats} />
                </div>
            )}

            {/* Queue */}
            <div className="section-label mb-3">Review Queue</div>
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
                    <p className="font-mono text-sm mb-1" style={{ color: "var(--text)" }}>Queue is empty</p>
                    <p className="text-xs" style={{ color: "var(--subtle)" }}>
                        All pipeline-passed tasks have been reviewed. Check back later.
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
                                        {/* Ready indicator */}
                                        <div
                                            className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                                            style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
                                        >
                                            <Clock className="w-4 h-4" style={{ color: "var(--amber)" }} />
                                        </div>

                                        <div className="min-w-0">
                                            <p className="font-medium text-sm mb-0.5" style={{ color: "var(--text)" }}>
                                                {task.title}
                                            </p>
                                            <div className="flex items-center gap-3 text-xs font-mono" style={{ color: "var(--subtle)" }}>
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
                                    <div className="flex items-center gap-4 flex-shrink-0">
                                        <div className="text-right">
                                            <div className="section-label mb-0.5">Quality</div>
                                            <ScoreDisplay score={task.qualityScore} size="sm" />
                                        </div>

                                        <StatusBadge status="pipeline_passed" />

                                        {/* Inline action buttons */}
                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                disabled={isActing}
                                                onClick={() => handleReject(task)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                                                style={{
                                                    background: "rgba(255,68,68,0.08)",
                                                    color: "var(--red)",
                                                    border: "1px solid rgba(255,68,68,0.2)",
                                                    opacity: isActing ? 0.5 : 1,
                                                    cursor: isActing ? "not-allowed" : "pointer",
                                                }}
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                                Reject
                                            </button>
                                            <button
                                                disabled={isActing}
                                                onClick={() => handleApprove(task)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                                                style={{
                                                    background: "rgba(0,230,118,0.1)",
                                                    color: "var(--green)",
                                                    border: "1px solid rgba(0,230,118,0.25)",
                                                    opacity: isActing ? 0.5 : 1,
                                                    cursor: isActing ? "not-allowed" : "pointer",
                                                    boxShadow: isActing ? "none" : "0 0 8px rgba(0,230,118,0.1)",
                                                }}
                                            >
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                Approve
                                            </button>
                                        </div>
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
                                        <div className="grid grid-cols-4 gap-3">
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
                                        {task.pipelineLogs && (
                                            <div>
                                                <div className="section-label mb-2">Pipeline Stages</div>
                                                <PipelineStages logs={task.pipelineLogs} taskStatus="pipeline_passed" />
                                            </div>
                                        )}

                                        {/* Sia proof */}
                                        <SiaProof siaHash={task.siaHash} indexdKey={task.indexdKey} />

                                        {/* Docker / config strip */}
                                        <div className="grid grid-cols-3 gap-3">
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

                                        {/* Bottom actions */}
                                        <div className="flex items-center justify-end gap-2 pt-2">
                                            <button
                                                disabled={isActing}
                                                onClick={() => handleReject(task)}
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
                                                onClick={() => handleApprove(task)}
                                                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all"
                                                style={{
                                                    background: "rgba(0,230,118,0.1)",
                                                    color: "var(--green)",
                                                    border: "1px solid rgba(0,230,118,0.25)",
                                                    opacity: isActing ? 0.5 : 1,
                                                    boxShadow: isActing ? "none" : "0 0 12px rgba(0,230,118,0.15)",
                                                }}
                                            >
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                Approve Task
                                            </button>
                                        </div>
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