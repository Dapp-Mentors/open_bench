"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Loader2, Clock,
  Play, Upload, Database, ExternalLink, Zap,
} from "lucide-react";
import type { Task, PipelineLog, BenchmarkRun, ModelOption } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description: string;
  domain: string;
  createdAt: string;
  tasks: ProjectTask[];
}

interface EpisodeRun {
  n: number;
  passed: boolean;
  testsRun: number;
  testsPassed: number;
  reward: number;
  status: "completed" | "running" | "pending";
}

interface PipelineStageDetail {
  key: string;
  label: string;
  desc: string;
  passed: boolean | null;
  running: boolean;
  message?: string;
  episodes?: EpisodeRun[];   // for difficulty probe
  modelUsed?: string;         // e.g. "Sonnet 4.6" or "Opus 4.8"
}

interface ProjectTask extends Task {
  runs?: BenchmarkRun[];
  stageDetails?: PipelineStageDetail[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PIPELINE_DEF = [
  { key: "similarity",    label: "Similarity & Diversity",         desc: "Cosine similarity vs approved tasks" },
  { key: "ci",            label: "CI Checks",                      desc: "Container smoke test — exits 0?" },
  { key: "quality",       label: "Quality Check (11 criteria)",    desc: "LLM score ≥ 0.6 across 11 criteria" },
  { key: "preflight",     label: "Validation pre-flight",          desc: "pytest --collect-only passes" },
  { key: "oracle_nop",    label: "Oracle / NOP Validation",        desc: "Tests fail before, pass after solve.sh" },
  { key: "easiness",      label: "Easiness Prefilter",             desc: "Sonnet 4.6 must not solve it (pass@5 = 1/5)" },
  { key: "difficulty",    label: "Opus 4.8 Difficulty Probe",      desc: "Must land 1–3/5 passes" },
  { key: "agent_quality", label: "Agent Quality Check",            desc: "Benchmark designer verdict" },
] as const;

const PROVIDER_COLOR: Record<string, string> = {
  ollama:    "var(--green)",
  anthropic: "var(--amber)",
  deepseek:  "var(--blue)",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StageIcon({ passed, running }: { passed: boolean | null; running: boolean }) {
  if (running)      return <Loader2  className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "var(--blue)"   }} />;
  if (passed === true)  return <CheckCircle className="w-4 h-4 flex-shrink-0"       style={{ color: "var(--green)"  }} />;
  if (passed === false) return <XCircle     className="w-4 h-4 flex-shrink-0"       style={{ color: "var(--red)"    }} />;
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

function PipelineStageRow({ stage }: { stage: PipelineStageDetail }) {
  const [open, setOpen] = useState(false);
  const hasEpisodes = stage.episodes && stage.episodes.length > 0;
  const passCount   = stage.episodes?.filter((e) => e.passed).length ?? 0;
  const totalEps    = stage.episodes?.length ?? 0;

  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="flex items-center gap-3 px-5 py-3 cursor-pointer select-none"
        style={{
          background:
            stage.running       ? "rgba(77,166,255,0.03)" :
            stage.passed === true  ? "transparent" :
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
                  stage.running        ? "var(--blue)"  :
                  stage.passed === true  ? "var(--text)"  :
                  stage.passed === false ? "var(--red)"   :
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
                  color:      stage.passed ? "var(--green)"         : "var(--red)",
                }}
              >
                pass@5: {passCount} / {totalEps}
                {stage.modelUsed && ` · PASSED (proceeded to Opus probe)`}
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
          {hasEpisodes && (
            <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
          )}
          {stage.passed === null && !stage.running && (
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

// Model picker inline panel
function ModelPicker({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const [models,   setModels]   = useState<ModelOption[]>([]);
  const [selected, setSelected] = useState<ModelOption | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((m) => {
      if (Array.isArray(m)) {
        setModels(m);
        setSelected(m.find((x: ModelOption) => x.provider === "ollama") ?? m[0] ?? null);
      }
    });
  }, []);

  const grouped = {
    ollama:    models.filter((m) => m.provider === "ollama"),
    anthropic: models.filter((m) => m.provider === "anthropic"),
    deepseek:  models.filter((m) => m.provider === "deepseek"),
  };

  async function handleStart() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, agentConfig: { provider: selected.provider, modelId: selected.modelId } }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to start run");
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <div
      className="mx-5 mb-4 rounded-lg p-4 border"
      style={{ background: "rgba(0,230,118,0.02)", borderColor: "rgba(0,230,118,0.2)" }}
    >
      <div className="section-label mb-3" style={{ color: "var(--green)" }}>Run against a model</div>
      <div className="space-y-3 mb-4">
        {(["ollama", "anthropic", "deepseek"] as const).map((provider) => {
          const mods = grouped[provider];
          if (mods.length === 0) return null;
          const color = PROVIDER_COLOR[provider];
          return (
            <div key={provider}>
              <p className="font-mono text-xs mb-1.5" style={{ color }}>
                {provider === "ollama" ? "Local · Ollama" : provider === "anthropic" ? "Anthropic" : "DeepSeek"}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {mods.map((m) => {
                  const isSel = selected?.modelId === m.modelId && selected?.provider === m.provider;
                  return (
                    <button
                      key={m.modelId}
                      type="button"
                      onClick={() => setSelected(m)}
                      className="text-left px-3 py-2 rounded border transition-all"
                      style={{
                        background:   isSel ? `${color}10` : "var(--surface)",
                        borderColor:  isSel ? `${color}40` : "var(--border)",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        {isSel && <Zap className="w-3 h-3" style={{ color }} />}
                        <span className="font-mono text-xs font-medium" style={{ color: isSel ? color : "var(--text)" }}>
                          {m.label}
                        </span>
                      </div>
                      <div className="font-mono text-xs" style={{ color: "var(--subtle)" }}>{m.modelId}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="font-mono text-xs mb-3" style={{ color: "var(--red)" }}>{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleStart}
          disabled={loading || !selected}
          className="bench-btn-primary flex items-center gap-1.5 px-4 py-2 rounded text-xs disabled:opacity-40"
        >
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting…</>
          ) : (
            <><Play className="w-3.5 h-3.5" /> Start Run</>
          )}
        </button>
        <button onClick={onClose} className="bench-btn-ghost px-4 py-2 rounded text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Task accordion row ───────────────────────────────────────────────────────

function TaskRow({ task }: { task: ProjectTask }) {
  const [open,       setOpen]       = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const stages = buildStages(task.pipelineLogs ?? [], task.status, task.stageDetails);
  const passedStages = stages.filter((s) => s.passed === true).length;
  const isRunning    = task.status === "pipeline_running";
  const isApproved   = task.status === "approved";
  const isRejected   = task.status === "rejected";

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: isRejected ? "rgba(255,68,68,0.2)" : isApproved ? "rgba(0,230,118,0.2)" : "var(--border)" }}
    >
      {/* Row header — always visible */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
        style={{ background: "var(--surface)" }}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Expand arrow */}
        <div style={{ color: "var(--muted)" }}>
          {open
            ? <ChevronDown  className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />
          }
        </div>

        {/* File icon + name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base" style={{ color: "var(--subtle)" }}>📄</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                {task.title}.zip
              </span>
              {task.description && (
                <span
                  className="font-mono text-xs px-2 py-0.5 rounded"
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

        {/* Right side: pipeline progress + status badge */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isRunning && (
            <span className="font-mono text-xs" style={{ color: "var(--blue)" }}>
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
            {/* Pipeline header */}
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
              {/* Progress bar */}
              <div className="w-32">
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ background: "var(--muted)" }}
                >
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

            {/* Stage rows */}
            {stages.map((stage) => (
              <PipelineStageRow key={stage.key} stage={stage} />
            ))}
          </div>

          {/* Approved — show run history + run button */}
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
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono text-xs px-1.5 py-0.5 rounded"
                            style={{
                              background: `${PROVIDER_COLOR[r.provider] ?? "var(--text)"}15`,
                              color: PROVIDER_COLOR[r.provider] ?? "var(--text)",
                              border: `1px solid ${PROVIDER_COLOR[r.provider] ?? "var(--text)"}30`,
                            }}
                          >
                            {r.provider}
                          </span>
                          <span className="font-mono text-sm" style={{ color: "var(--text)" }}>
                            {r.modelId}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {r.score != null && (
                            <span
                              className="font-mono text-sm font-bold"
                              style={{ color: r.score === 1 ? "var(--green)" : "var(--red)" }}
                            >
                              {(r.score * 100).toFixed(0)}%
                            </span>
                          )}
                          <StatusChip status={r.status} />
                          {r.siaHash && (
                            <Database className="w-3.5 h-3.5" style={{ color: "var(--cyan)" }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!showPicker ? (
                <button
                  onClick={() => setShowPicker(true)}
                  className="bench-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs"
                >
                  <Play className="w-3.5 h-3.5" />
                  Run Benchmark
                </button>
              ) : (
                <ModelPicker taskId={task.id} onClose={() => setShowPicker(false)} />
              )}
            </div>
          )}

          {/* Sia proof if available */}
          {task.siaHash && (
            <div className="mx-4 mb-4 rounded-lg p-3 border flex items-center gap-3"
              style={{ background: "rgba(0,188,212,0.04)", borderColor: "rgba(0,188,212,0.2)" }}
            >
              <Database className="w-4 h-4 flex-shrink-0" style={{ color: "var(--cyan)" }} />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs font-semibold mb-0.5" style={{ color: "var(--cyan)" }}>
                  SIA NETWORK
                </p>
                <p className="font-mono text-xs truncate" style={{ color: "var(--subtle)" }}>
                  {task.siaHash}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Small inline status chip (no separate component file needed here)
function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    pending:          { bg: "rgba(90,96,114,0.15)",  color: "var(--subtle)",  label: "pending"          },
    pipeline_running: { bg: "rgba(77,166,255,0.12)", color: "var(--blue)",    label: "running"          },
    approved:         { bg: "rgba(0,230,118,0.12)",  color: "var(--green)",   label: "Ready for Review" },
    rejected:         { bg: "rgba(255,68,68,0.12)",  color: "var(--red)",     label: "rejected"         },
    running:          { bg: "rgba(77,166,255,0.12)", color: "var(--blue)",    label: "running"          },
    completed:        { bg: "rgba(0,230,118,0.12)",  color: "var(--green)",   label: "completed"        },
    failed:           { bg: "rgba(255,68,68,0.12)",  color: "var(--red)",     label: "failed"           },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildStages(
  logs: PipelineLog[],
  taskStatus: string,
  overrides?: PipelineStageDetail[],
): PipelineStageDetail[] {
  return PIPELINE_DEF.map((def, idx) => {
    const override = overrides?.find((o) => o.key === def.key);
    if (override) return override;

    const log      = logs.find((l) => l.stage === def.key);
    const lastLog  = logs[logs.length - 1];
    const lastIdx  = PIPELINE_DEF.findIndex((d) => d.key === lastLog?.stage);
    const isNext   = taskStatus === "pipeline_running" && idx === lastIdx + 1;
    const isFirst  = taskStatus === "pipeline_running" && logs.length === 0 && idx === 0;

    return {
      key:     def.key,
      label:   def.label,
      desc:    def.desc,
      passed:  log ? (log.passed ?? null) : null,
      running: isFirst || isNext,
      message: log?.message,
    };
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectDetail({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${params.id}`);
    if (res.ok) {
      setProject(await res.json());
    }
    setLoading(false);
  }, [params.id]);

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

  const approvedCount = project?.tasks.filter((t) => t.status === "approved").length ?? 0;
  const pendingCount  = project?.tasks.filter(
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
      <div className="flex items-start justify-between mb-2 gap-4">
        <div>
          <div className="section-label mb-2">Project</div>
          <h1 className="font-display text-2xl font-bold mb-1" style={{ color: "var(--text)" }}>
            {project.name}
          </h1>
          <p className="text-sm" style={{ color: "var(--subtle)", maxWidth: "520px", lineHeight: 1.6 }}>
            {project.description}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/projects/${project.id}/submit`}
            className="bench-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs"
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
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total Tasks", value: project.tasks.length, color: "var(--text)"  },
          { label: "Approved",    value: approvedCount,         color: "var(--green)" },
          { label: "In Pipeline", value: pendingCount,          color: "var(--blue)"  },
          { label: "Rejected",    value: rejectedCount,         color: "var(--red)"   },
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
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
