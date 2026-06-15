"use client";

import {
    CheckCircle,
    XCircle,
    Loader2,
    TrendingUp,
    Activity,
    ListChecks,
} from "lucide-react";
import { SiaPipelineAccordion } from "@/components/admin/SiaPipelineAccordion";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Sia push pipeline counts (returned by /api/admin/stats) */
export interface SiaStats {
    /** Approved tasks not yet pushed (siaStatus=pending) */
    pending: number;
    /** Tasks queued for upload (siaStatus=queued) */
    queued: number;
    /** Tasks currently transferring to Sia (siaStatus=uploading) */
    uploading: number;
    /** Tasks being pinned on an indexer node (siaStatus=pinning) */
    pinning: number;
    /** Tasks fully on Sia and downloadable (siaStatus=ready) */
    ready: number;
    /** Tasks whose Sia push errored (siaStatus=failed) */
    failed: number;
    /** Total approved tasks (pending Sia push or done) */
    total: number;
}

export interface BenchmarkStats {
    /** All tasks across all projects */
    totalTasks: number;
    approved: number;
    inPipeline: number;
    rejected: number;
    /** Tasks that passed the full pipeline but are awaiting human review */
    awaitingReview: number;
    /** 0–1 pass rate across all pipeline-processed tasks */
    passRate?: number;
    /** Total benchmark runs ever fired */
    totalRuns?: number;
    /** Currently-running benchmark runs */
    activeRuns?: number;
    /** Avg quality score 0–1 across pipeline-passed tasks */
    avgQualityScore?: number;
    /** Sia push pipeline breakdown (present when approved tasks exist) */
    sia?: SiaStats;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
    label: string;
    value: string | number;
    color: string;
    icon: React.ReactNode;
    iconTint: string;
    iconBorder: string;
    sub?: string;
    live?: boolean;
}

function StatCard({ label, value, color, icon, iconTint, iconBorder, sub, live }: StatCardProps) {
    return (
        <div
            className="bench-card rounded-lg px-4 py-3.5 flex flex-col gap-2"
            style={{ borderColor: `${color}22` }}
        >
            <div className="flex items-center justify-between">
                <span className="section-label">{label}</span>
                <div
                    className="flex items-center justify-center w-6 h-6 rounded"
                    style={{ background: iconTint, border: `1px solid ${iconBorder}` }}
                >
                    {icon}
                </div>
            </div>

            <div className="flex items-center gap-2">
                {live && (
                    <span
                        className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
                        style={{ background: color }}
                    />
                )}
                <span className="font-display font-bold text-2xl leading-none" style={{ color }}>
                    {value}
                </span>
            </div>

            {sub && (
                <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                    {sub}
                </p>
            )}
        </div>
    );
}

// ─── Distribution bar ─────────────────────────────────────────────────────────

function DistributionBar({
    approved,
    inPipeline,
    rejected,
    awaitingReview,
    total,
}: {
    approved: number;
    inPipeline: number;
    rejected: number;
    awaitingReview: number;
    total: number;
}) {
    if (total === 0) return null;

    const pending = total - approved - inPipeline - rejected - awaitingReview;

    const segments = [
        { pct: (approved / total) * 100, color: "var(--green)", label: "Approved" },
        { pct: (awaitingReview / total) * 100, color: "var(--amber)", label: "Awaiting Review" },
        { pct: (inPipeline / total) * 100, color: "var(--blue)", label: "In Pipeline" },
        { pct: (rejected / total) * 100, color: "var(--red)", label: "Rejected" },
        { pct: (pending / total) * 100, color: "var(--muted)", label: "Pending" },
    ].filter((s) => s.pct > 0);

    return (
        <>
            <div className="flex h-1.5 rounded-full overflow-hidden gap-px" style={{ background: "var(--muted)" }}>
                {segments.map((s) => (
                    <div
                        key={s.label}
                        className="h-full transition-all duration-700"
                        style={{ width: `${s.pct}%`, background: s.color }}
                    />
                ))}
            </div>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2">
                {segments.map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{s.label}</span>
                    </div>
                ))}
            </div>
        </>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function BenchmarkCards({ stats }: { stats: BenchmarkStats }) {
    const {
        totalTasks, approved, inPipeline, rejected, awaitingReview,
        passRate, totalRuns, activeRuns, avgQualityScore, sia,
    } = stats;

    const passRateColor =
        passRate == null ? "var(--subtle)"
            : passRate >= 0.6 ? "var(--green)"
                : passRate >= 0.35 ? "var(--amber)"
                    : "var(--red)";

    return (
        <div>
            {/* ── Eyebrow ── */}
            <div className="flex items-center gap-3 mb-3">
                <span className="section-label">Platform Overview</span>
                {inPipeline > 0 && (
                    <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-xs"
                        style={{
                            background: "rgba(77,166,255,0.10)",
                            border: "1px solid rgba(77,166,255,0.25)",
                            color: "var(--blue)",
                        }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--blue)" }} />
                        {inPipeline} running
                    </span>
                )}
                {awaitingReview > 0 && (
                    <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-xs"
                        style={{
                            background: "rgba(251,191,36,0.10)",
                            border: "1px solid rgba(251,191,36,0.25)",
                            color: "var(--amber)",
                        }}
                    >
                        {awaitingReview} awaiting review
                    </span>
                )}
            </div>

            {/* ── Primary stat row ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <StatCard
                    label="Total Tasks"
                    value={totalTasks}
                    color="var(--text)"
                    icon={<ListChecks className="w-3.5 h-3.5" style={{ color: "var(--subtle)" }} />}
                    iconTint="rgba(140,148,168,0.10)"
                    iconBorder="rgba(140,148,168,0.20)"
                />
                <StatCard
                    label="Approved"
                    value={approved}
                    color="var(--green)"
                    icon={<CheckCircle className="w-3.5 h-3.5" style={{ color: "var(--green)" }} />}
                    iconTint="rgba(0,230,118,0.08)"
                    iconBorder="rgba(0,230,118,0.20)"
                    sub={totalTasks > 0 ? `${((approved / totalTasks) * 100).toFixed(0)}% of total` : undefined}
                />
                <StatCard
                    label="In Pipeline"
                    value={inPipeline}
                    color="var(--blue)"
                    icon={
                        <Loader2
                            className={`w-3.5 h-3.5 ${inPipeline > 0 ? "animate-spin" : ""}`}
                            style={{ color: "var(--blue)" }}
                        />
                    }
                    iconTint="rgba(77,166,255,0.08)"
                    iconBorder="rgba(77,166,255,0.20)"
                    live={inPipeline > 0}
                />
                <StatCard
                    label="Rejected"
                    value={rejected}
                    color="var(--red)"
                    icon={<XCircle className="w-3.5 h-3.5" style={{ color: "var(--red)" }} />}
                    iconTint="rgba(255,68,68,0.08)"
                    iconBorder="rgba(255,68,68,0.20)"
                    sub={totalTasks > 0 ? `${((rejected / totalTasks) * 100).toFixed(0)}% rejection rate` : undefined}
                />
            </div>

            {/* ── Distribution bar card ── */}
            <div className="bench-card rounded-lg px-4 py-3.5 mb-3">
                <div className="flex items-center justify-between mb-2.5">
                    <span className="section-label">Task Distribution</span>
                    <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                        {totalTasks} total
                    </span>
                </div>
                {totalTasks === 0 ? (
                    <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>No tasks submitted yet.</p>
                ) : (
                    <DistributionBar
                        approved={approved}
                        inPipeline={inPipeline}
                        rejected={rejected}
                        awaitingReview={awaitingReview}
                        total={totalTasks}
                    />
                )}
            </div>

            {/* ── Sia push pipeline accordion ── */}
            {sia && sia.total > 0 && (
                <div className="mb-3">
                    <SiaPipelineAccordion sia={sia} />
                </div>
            )}

            {/* ── Secondary row: pass rate · avg quality · benchmark runs ── */}
            {(passRate != null || avgQualityScore != null || totalRuns != null) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {passRate != null && (
                        <StatCard
                            label="Pipeline Pass Rate"
                            value={`${(passRate * 100).toFixed(1)}%`}
                            color={passRateColor}
                            icon={<TrendingUp className="w-3.5 h-3.5" style={{ color: passRateColor }} />}
                            iconTint={`${passRateColor}15`}
                            iconBorder={`${passRateColor}30`}
                            sub="Across all pipeline runs"
                        />
                    )}
                    {avgQualityScore != null && (
                        <StatCard
                            label="Avg Quality Score"
                            value={`${(avgQualityScore * 100).toFixed(0)}%`}
                            color={avgQualityScore >= 0.6 ? "var(--green)" : avgQualityScore >= 0.4 ? "var(--amber)" : "var(--red)"}
                            icon={
                                <CheckCircle
                                    className="w-3.5 h-3.5"
                                    style={{ color: avgQualityScore >= 0.6 ? "var(--green)" : avgQualityScore >= 0.4 ? "var(--amber)" : "var(--red)" }}
                                />
                            }
                            iconTint={avgQualityScore >= 0.6 ? "rgba(0,230,118,0.08)" : "rgba(255,193,7,0.08)"}
                            iconBorder={avgQualityScore >= 0.6 ? "rgba(0,230,118,0.20)" : "rgba(255,193,7,0.20)"}
                            sub="11-criteria LLM judge"
                        />
                    )}
                    {totalRuns != null && (
                        <StatCard
                            label="Benchmark Runs"
                            value={totalRuns}
                            color="var(--cyan)"
                            icon={<Activity className="w-3.5 h-3.5" style={{ color: "var(--cyan)" }} />}
                            iconTint="rgba(0,188,212,0.08)"
                            iconBorder="rgba(0,188,212,0.20)"
                            live={!!activeRuns && activeRuns > 0}
                            sub={activeRuns ? `${activeRuns} active now` : "No active runs"}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
