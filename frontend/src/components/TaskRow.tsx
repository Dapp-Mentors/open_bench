"use client";

import { useState } from "react";
import {
    ChevronDown, ChevronRight,
    CheckCircle, XCircle, Loader2, Clock,
    Upload, Database, RefreshCw,
} from "lucide-react";
import type { Task, PipelineLog, BenchmarkRun } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EpisodeRun {
    n: number;
    passed: boolean;
    testsRun: number;
    testsPassed: number;
    reward: number;
    status: "completed" | "running" | "pending";
}

export interface PipelineStageDetail {
    key: string;
    label: string;
    desc: string;
    passed: boolean | null;
    running: boolean;
    message?: string;
    episodes?: EpisodeRun[];
    modelUsed?: string;
}

export interface ProjectTask extends Omit<Task, "runs"> {
    runs?: BenchmarkRun[];
    stageDetails?: PipelineStageDetail[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const PIPELINE_DEF = [
    { key: "similarity", label: "Similarity & Diversity", desc: "Cosine similarity vs approved tasks" },
    { key: "ci", label: "CI Checks", desc: "Container smoke test — exits 0?" },
    { key: "quality", label: "Quality Check (11 criteria)", desc: "LLM score ≥ 0.6 across 11 criteria" },
    { key: "preflight", label: "Validation pre-flight", desc: "pytest --collect-only passes" },
    { key: "oracle_nop", label: "Oracle / NOP Validation", desc: "Tests fail before, pass after solve.sh" },
    { key: "easiness", label: "Easiness Prefilter", desc: "Model must not solve it (pass@5 = 1/5)" },
    { key: "difficulty", label: "Difficulty Probe", desc: "Frontier model must land 1–3/5 passes" },
    { key: "agent_quality", label: "Agent Quality Check", desc: "Benchmark designer verdict" },
    { key: "sia_upload", label: "Sia Network Upload", desc: "Decentralized storage via Sia" },
] as const;

export const PROVIDER_COLOR: Record<string, string> = {
    openrouter: "var(--green)",
    ollama: "var(--green)",
    anthropic: "var(--amber)",
    deepseek: "var(--blue)",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function buildStages(
    logs: PipelineLog[],
    taskStatus: string,
    overrides?: PipelineStageDetail[],
): PipelineStageDetail[] {
    return PIPELINE_DEF.map((def, idx) => {
        const override = overrides?.find((o) => o.key === def.key);
        if (override) return override;

        const log = logs.find((l) => l.stage === def.key);
        const lastLog = logs[logs.length - 1];
        const lastIdx = PIPELINE_DEF.findIndex((d) => d.key === lastLog?.stage);
        const isNext = taskStatus === "pipeline_running" && idx === lastIdx + 1;
        const isFirst = taskStatus === "pipeline_running" && logs.length === 0 && idx === 0;

        return {
            key: def.key,
            label: def.label,
            desc: def.desc,
            passed: log ? (log.passed ?? null) : null,
            running: isFirst || isNext,
            message: log?.message,
        };
    });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StageIcon({ passed, running }: { passed: boolean | null; running: boolean }) {
    if (running) return <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "var(--blue)" }} />;
    if (passed === true) return <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--green)" }} />;
    if (passed === false) return <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--red)" }} />;
    return <Clock className="w-4 h-4 flex-shrink-0" style={{ color: "var(--muted)" }} />;
}

function EpisodePill({ ep }: { ep: EpisodeRun }) {
    const color = ep.passed ? "var(--green)" : "var(--red)";
    return (
        <div
            className="flex items-center gap-2 px-3 py-2 rounded text-xs font-mono"
            style={{
                background: ep.passed ? "rgba(0,230,118,0.06)" : "rgba(255,68,68,0.06)",
                border: `1px solid ${ep.passed ? "rgba(0,230,118,0.18)" : "rgba(255,68,68,0.18)"}`,
            }}
        >
            <span style={{ color: "var(--subtle)" }}>Run {ep.n}</span>
            <span style={{ color }}>{ep.passed ? "✓ passed" : "✗ failed"}</span>
            <span style={{ color: "var(--muted)" }}>·</span>
            <span style={{ color: "var(--subtle)" }}>{ep.testsPassed}/{ep.testsRun} tests</span>
            <span style={{ color: "var(--muted)" }}>·</span>
            <span style={{ color: "var(--subtle)" }}>reward {ep.reward}</span>
            <span
                className="ml-auto px-1.5 py-0.5 rounded"
                style={{ background: "var(--muted)", color: "var(--subtle)" }}
            >
                completed
            </span>
        </div>
    );
}

function PipelineStageRow({ stage, onRetryDifficulty, difficultyRetries, maxRetries, retrying }: {
    stage: PipelineStageDetail;
    onRetryDifficulty?: () => void;
    difficultyRetries?: number;
    maxRetries?: number;
    retrying?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const hasEpisodes = stage.episodes && stage.episodes.length > 0;
    const passCount = stage.episodes?.filter((e) => e.passed).length ?? 0;
    const totalEps = stage.episodes?.length ?? 0;

    const isDifficulty = stage.key === "difficulty";
    const isDifficultyFailed = isDifficulty && stage.passed === false;
    const retriesExhausted = isDifficulty && difficultyRetries !== undefined && maxRetries !== undefined && difficultyRetries >= maxRetries;

    return (
        <div
            className="border-b last:border-b-0"
            style={{ borderColor: "var(--border)" }}
        >
            <div
                className="flex items-center gap-3 px-5 py-3 cursor-pointer select-none"
                style={{
                    background:
                        stage.running ? "rgba(77,166,255,0.03)" :
                            stage.passed === true ? "transparent" :
                                stage.passed === false ? "rgba(255,68,68,0.02)" :
                                    "transparent",
                }}
                onClick={() => hasEpisodes && setOpen((o) => !o)}
            >
                <StageIcon passed={stage.passed} running={stage.running} />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span
                            className="text-sm"
                            style={{
                                color:
                                    stage.running ? "var(--blue)" :
                                        stage.passed === true ? "var(--text)" :
                                            stage.passed === false ? "var(--red)" :
                                                "var(--subtle)",
                                fontWeight: stage.passed !== null || stage.running ? 500 : 400,
                            }}
                        >
                            {stage.label}
                        </span>
                        {hasEpisodes && stage.passed !== null && (
                            <span
                                className="font-mono text-xs px-1.5 py-0.5 rounded"
                                style={{
                                    background: stage.passed ? "rgba(0,230,118,0.1)" : "rgba(255,68,68,0.1)",
                                    color: stage.passed ? "var(--green)" : "var(--red)",
                                }}
                            >
                                pass@5: {passCount} / {totalEps}
                                {stage.modelUsed && ` · PASSED (proceeded to Opus probe)`}
                            </span>
                        )}
                        {isDifficultyFailed && difficultyRetries !== undefined && (
                            <span
                                className="font-mono text-xs px-1.5 py-0.5 rounded"
                                style={{
                                    background: "rgba(251,191,36,0.1)",
                                    color: "var(--amber)",
                                    border: "1px solid rgba(251,191,36,0.2)",
                                }}
                            >
                                retry {difficultyRetries}/{maxRetries ?? 3}
                            </span>
                        )}
                    </div>
                    {stage.message && (
                        <p className="font-mono text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                            {stage.message}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                    {isDifficultyFailed && onRetryDifficulty && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRetryDifficulty();
                            }}
                            disabled={retrying || retriesExhausted}
                            title={
                                retriesExhausted
                                    ? `Max retries (${maxRetries}) reached`
                                    : `Retry difficulty probe (${difficultyRetries ?? 0}/${maxRetries ?? 3})`
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                                background: retriesExhausted
                                    ? "rgba(90,96,114,0.1)"
                                    : "rgba(251,191,36,0.1)",
                                border: `1px solid ${
                                    retriesExhausted
                                        ? "rgba(90,96,114,0.2)"
                                        : "rgba(251,191,36,0.3)"
                                }`,
                                color: retriesExhausted ? "var(--muted)" : "var(--amber)",
                            }}
                        >
                            {retrying ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            {retriesExhausted ? "Exhausted" : "Retry"}
                        </button>
                    )}
                    {hasEpisodes && (
                        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </span>
                    )}
                    {stage.passed === null && !stage.running && !isDifficultyFailed && (
                        <span style={{ color: "var(--muted)", fontSize: "1rem" }}>—</span>
                    )}
                </div>
            </div>

            {open && hasEpisodes && (
                <div className="px-5 pb-4 space-y-1.5">
                    <p className="font-mono text-xs mb-2" style={{ color: "var(--subtle)" }}>
                        PER-RUN EPISODES ({totalEps})
                    </p>
                    {stage.episodes!.map((ep) => (
                        <EpisodePill key={ep.n} ep={ep} />
                    ))}
                    <button
                        onClick={() => setOpen(false)}
                        className="text-xs font-mono mt-2"
                        style={{ color: "var(--subtle)" }}
                    >
                        ↑ Hide detail
                    </button>
                </div>
            )}
        </div>
    );
}

function StatusChip({ status }: { status: string }) {
    const cfg: Record<string, { bg: string; color: string; label: string }> = {
        pending: { bg: "rgba(90,96,114,0.15)", color: "var(--subtle)", label: "pending" },
        pipeline_running: { bg: "rgba(77,166,255,0.12)", color: "var(--blue)", label: "running" },
        pipeline_passed: { bg: "rgba(0,230,118,0.12)", color: "var(--green)", label: "Ready for Review" },
        approved: { bg: "rgba(0,230,118,0.12)", color: "var(--green)", label: "Approved" },
        rejected: { bg: "rgba(255,68,68,0.12)", color: "var(--red)", label: "rejected" },
        running: { bg: "rgba(77,166,255,0.12)", color: "var(--blue)", label: "running" },
        completed: { bg: "rgba(0,230,118,0.12)", color: "var(--green)", label: "completed" },
        failed: { bg: "rgba(255,68,68,0.12)", color: "var(--red)", label: "failed" },
    };
    const c = cfg[status] ?? cfg.pending;
    const pulse = status === "pipeline_running" || status === "running";
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-xs"
            style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}30` }}
        >
            {pulse && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.color }} />}
            {c.label}
        </span>
    );
}

// ─── TaskRow (main export) ────────────────────────────────────────────────────

export function TaskRow({ task, projectId, onDeleted, onTaskUpdated }: {
    task: ProjectTask;
    projectId: string;
    onDeleted: (taskId: string) => void;
    onTaskUpdated?: (taskId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [retrying, setRetrying] = useState(false);
    const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
    const [optimisticRetries, setOptimisticRetries] = useState<number>(task.difficultyRetries ?? 0);

    // Use optimistic state if available, otherwise fall back to the prop
    const displayStatus = optimisticStatus ?? task.status;
    const displayRetries = optimisticRetries;

    const stages = buildStages(task.pipelineLogs ?? [], displayStatus, task.stageDetails);
    const passedStages = stages.filter((s) => s.passed === true).length;
    const isRunning = displayStatus === "pipeline_running";
    const isApproved = displayStatus === "approved";
    const isRejected = displayStatus === "rejected";

    const MAX_RETRIES = 3;
    const difficultyRetries = displayRetries;

    async function handleDelete() {
        if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const data = await res.json();
                alert(data.error ?? "Failed to delete task");
                setDeleting(false);
                return;
            }
            onDeleted(task.id);
        } catch {
            alert("Something went wrong");
            setDeleting(false);
        }
    }

    async function handleRetryDifficulty() {
        setRetrying(true);
        try {
            const res = await fetch(`/api/tasks/${task.id}/retry-difficulty`, {
                method: "POST",
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                alert(data.error ?? "Failed to retry difficulty probe");
                setRetrying(false);
                return;
            }
            // Optimistically update local state — no page reload needed
            setOptimisticStatus("pending");
            setOptimisticRetries((prev) => prev + 1);
            setRetrying(false);
            // Notify parent to refresh task data in the background
            onTaskUpdated?.(task.id);
        } catch {
            alert("Network error. Failed to retry difficulty probe.");
            setRetrying(false);
        }
    }

    return (
        <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: isRejected ? "rgba(255,68,68,0.2)" : isApproved ? "rgba(0,230,118,0.2)" : "var(--border)" }}
        >
            {/* Row header */}
                <div
                    className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
                    style={{ background: "var(--surface)" }}
                    onClick={() => setOpen((o) => !o)}
                >
                    <div style={{ color: "var(--muted)" }}>
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-base flex-shrink-0" style={{ color: "var(--subtle)" }}>📄</span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-medium truncate max-w-[200px] sm:max-w-none" style={{ color: "var(--text)" }}>
                                    {task.title}.zip
                                </span>
                                {task.description && (
                                    <span
                                        className="font-mono text-xs px-2 py-0.5 rounded truncate max-w-[120px] sm:max-w-none hidden sm:inline"
                                        style={{ background: "var(--muted)", color: "var(--subtle)", border: "1px solid var(--border)" }}
                                    >
                                        {task.description.slice(0, 40)}
                                    </span>
                                )}
                            </div>
                            <p className="font-mono text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                                Submitted: {new Date(task.createdAt).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                        {isRunning && (
                            <span className="font-mono text-xs hidden sm:inline" style={{ color: "var(--blue)" }}>
                                {passedStages}/{PIPELINE_DEF.length} stages
                            </span>
                        )}
                        <StatusChip status={task.status} />
                    </div>
                </div>

            {/* Expanded body */}
            {open && (
                <div style={{ background: "var(--bg, #0a0b0d)" }}>
                    {/* Pipeline stages */}
                    <div
                        className="mx-4 my-4 rounded-lg border overflow-hidden"
                        style={{ borderColor: "var(--border)" }}
                    >
                        <div
                            className="flex items-center justify-between px-5 py-3 border-b"
                            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                        >
                            <div>
                                <p className="font-mono text-xs font-semibold" style={{ color: "var(--subtle)" }}>
                                    HARBOR PIPELINE
                                </p>
                                <p className="font-mono text-xs mt-0.5" style={{ color: "var(--text)" }}>
                                    {isApproved
                                        ? `Completed all ${PIPELINE_DEF.length} steps`
                                        : isRejected
                                            ? "Pipeline rejected"
                                            : isRunning
                                                ? `Running — ${passedStages} of ${PIPELINE_DEF.length} complete`
                                                : "Pending"}
                                </p>
                            </div>
                            <div className="w-32">
                                <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                                    <div
                                        className="h-full rounded-full transition-all duration-700"
                                        style={{
                                            width: `${(passedStages / PIPELINE_DEF.length) * 100}%`,
                                            background: isApproved ? "var(--green)" : isRejected ? "var(--red)" : "var(--blue)",
                                        }}
                                    />
                                </div>
                                <p className="font-mono text-xs mt-1 text-right" style={{ color: "var(--subtle)" }}>
                                    {passedStages}/{PIPELINE_DEF.length}
                                </p>
                            </div>
                        </div>
                        {stages.map((stage) => (
                            <PipelineStageRow
                                key={stage.key}
                                stage={stage}
                                onRetryDifficulty={handleRetryDifficulty}
                                difficultyRetries={difficultyRetries}
                                maxRetries={MAX_RETRIES}
                                retrying={retrying}
                            />
                        ))}
                    </div>

                    {/* Approved — run history + run button */}
                    {isApproved && (
                        <div className="mx-4 mb-4">
                            {task.runs && task.runs.length > 0 && (
                                <div className="mb-3">
                                    <p className="section-label mb-2">Benchmark Runs</p>
                                    <div className="space-y-1.5">
                                        {task.runs.map((r) => (
                                            <div
                                                key={r.id}
                                                className="flex items-center justify-between px-4 py-2.5 rounded border"
                                                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
                                            >
                        <div className="flex items-center gap-2 min-w-0">
                            <span
                                className="font-mono text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                                style={{
                                    background: `${PROVIDER_COLOR[r.provider] ?? "var(--text)"}15`,
                                    color: PROVIDER_COLOR[r.provider] ?? "var(--text)",
                                    border: `1px solid ${PROVIDER_COLOR[r.provider] ?? "var(--text)"}30`,
                                }}
                            >
                                {r.provider}
                            </span>
                            <span className="font-mono text-sm truncate" style={{ color: "var(--text)" }}>{r.modelId}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                                                    {r.score != null && (
                                                        <span
                                                            className="font-mono text-sm font-bold"
                                                            style={{ color: r.score === 1 ? "var(--green)" : "var(--red)" }}
                                                        >
                                                            {(r.score * 100).toFixed(0)}%
                                                        </span>
                                                    )}
                                                    <StatusChip status={r.status} />
                                                    {r.siaHash && <Database className="w-3.5 h-3.5" style={{ color: "var(--cyan)" }} />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                        </div>
                    )}

                    {/* Sia proof */}
                    {task.siaHash && (
                        <div className="mx-4 mb-4 rounded-lg p-3 border flex items-center gap-3"
                            style={{ background: "rgba(0,188,212,0.04)", borderColor: "rgba(0,188,212,0.2)" }}
                        >
                            <Database className="w-4 h-4 flex-shrink-0" style={{ color: "var(--cyan)" }} />
                            <div className="flex-1 min-w-0">
                                <p className="font-mono text-xs font-semibold mb-0.5" style={{ color: "var(--cyan)" }}>SIA NETWORK</p>
                                <p className="font-mono text-xs truncate" style={{ color: "var(--subtle)" }}>{task.siaHash}</p>
                            </div>
                        </div>
                    )}

                    {/* Bottom action bar */}
                    <div className="mx-4 mb-4 pt-3 flex items-center gap-2 border-t" style={{ borderColor: "var(--border)" }}>
                        {isApproved && (
                            <a href={`/api/projects/${projectId}/tasks/${task.id}/download`}
                                className="bench-btn-ghost inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs"
                            >
                                <Upload className="w-3.5 h-3.5 rotate-180" />
                                Download
                            </a>
                        )}

                        {(task.status === "pending" || task.status === "rejected") && (
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all disabled:opacity-40"
                                style={{
                                    background: "rgba(255,68,68,0.08)",
                                    border: "1px solid rgba(255,68,68,0.25)",
                                    color: "var(--red)",
                                }}
                            >
                                {deleting
                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…</>
                                    : <><XCircle className="w-3.5 h-3.5" /> Delete Task</>
                                }
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}