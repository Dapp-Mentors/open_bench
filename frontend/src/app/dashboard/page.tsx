"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Play, RefreshCw, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ScoreDisplay } from "@/components/ScoreDisplay";
import type { Task, BenchmarkRun } from "@/lib/types";

type Tab = "tasks" | "runs";

function isActive(status: string) {
  return ["pending", "pipeline_running", "running"].includes(status);
}

export default function Dashboard() {
  const [tab,     setTab]     = useState<Tab>("tasks");
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [runs,    setRuns]    = useState<BenchmarkRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [t, r] = await Promise.all([
      fetch("/api/tasks").then((r) => r.json()).catch(() => []),
      fetch("/api/runs").then((r)  => r.json()).catch(() => []),
    ]);
    setTasks(Array.isArray(t) ? t : []);
    setRuns(Array.isArray(r) ? r : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-poll when something is active
  useEffect(() => {
    const hasActive = [...tasks, ...runs].some((i) => isActive(i.status));
    if (!hasActive) return;
    const timer = setInterval(fetchData, 2000);
    return () => clearInterval(timer);
  }, [tasks, runs, fetchData]);

  const approvedCount = tasks.filter((t) => t.status === "approved").length;
  const rejectedCount = tasks.filter((t) => t.status === "rejected").length;
  const runningCount  = runs.filter((r) => r.status === "running").length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="section-label mb-2">Control Panel</div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text)" }}>
            Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <Link
            href="/tasks/submit"
            className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Submit Task
          </Link>
          <Link
            href="/run/new"
            className="bench-btn-primary flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <Play className="w-3.5 h-3.5" />
            Run Benchmark
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total Tasks",  value: tasks.length,   color: "var(--text)"  },
          { label: "Approved",     value: approvedCount,  color: "var(--green)" },
          { label: "Rejected",     value: rejectedCount,  color: "var(--red)"   },
          { label: "Active Runs",  value: runningCount,   color: "var(--blue)"  },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bench-card rounded-lg px-4 py-3"
          >
            <div className="section-label mb-1">{label}</div>
            <div
              className="font-display font-bold text-2xl"
              style={{ color }}
            >
              {loading ? "—" : value}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div
        className="flex border-b mb-6"
        style={{ borderColor: "var(--border)" }}
      >
        {(["tasks", "runs"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2.5 text-sm font-mono transition-colors relative"
            style={{
              color: tab === t ? "var(--green)" : "var(--subtle)",
            }}
          >
            {t === "tasks"
              ? `Pipeline Tasks (${tasks.length})`
              : `Benchmark Runs (${runs.length})`}
            {tab === t && (
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: "var(--green)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {tab === "tasks" && (
        <div className="space-y-2">
          {loading && (
            <div className="text-center py-12 font-mono text-sm" style={{ color: "var(--subtle)" }}>
              Loading…
            </div>
          )}
          {!loading && tasks.length === 0 && (
            <div
              className="text-center py-16 border rounded-lg"
              style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
            >
              <p className="font-mono text-sm mb-3" style={{ color: "var(--subtle)" }}>
                No tasks yet.
              </p>
              <Link
                href="/tasks/submit"
                className="bench-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Submit your first task
              </Link>
            </div>
          )}
          {tasks.map((t) => (
            <Link
              key={t.id}
              href={`/tasks/${t.id}`}
              className="bench-card flex items-center justify-between px-5 py-4 rounded-lg group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="min-w-0">
                  <p
                    className="font-medium text-sm mb-0.5 group-hover:text-white transition-colors"
                    style={{ color: "var(--text)" }}
                  >
                    {t.title}
                  </p>
                  <p className="font-mono text-xs truncate max-w-xs" style={{ color: "var(--subtle)" }}>
                    {t.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {t._count && t._count.runs > 0 && (
                  <span className="font-mono text-xs" style={{ color: "var(--subtle)" }}>
                    {t._count.runs} run{t._count.runs !== 1 ? "s" : ""}
                  </span>
                )}
                <span
                  className="font-mono text-xs"
                  style={{ color: "var(--subtle)" }}
                >
                  {t.scoringType}
                </span>
                <StatusBadge status={t.status} />
                <ChevronRight className="w-4 h-4" style={{ color: "var(--muted)" }} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Runs list */}
      {tab === "runs" && (
        <div className="space-y-2">
          {loading && (
            <div className="text-center py-12 font-mono text-sm" style={{ color: "var(--subtle)" }}>
              Loading…
            </div>
          )}
          {!loading && runs.length === 0 && (
            <div
              className="text-center py-16 border rounded-lg"
              style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
            >
              <p className="font-mono text-sm mb-3" style={{ color: "var(--subtle)" }}>
                No runs yet.
              </p>
              <Link
                href="/run/new"
                className="bench-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded text-xs"
              >
                <Play className="w-3.5 h-3.5" />
                Start a benchmark run
              </Link>
            </div>
          )}
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/run/${r.id}`}
              className="bench-card flex items-center justify-between px-5 py-4 rounded-lg group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 font-mono text-xs font-bold"
                  style={{
                    background: r.provider === "anthropic" ? "rgba(255,179,0,0.1)" :
                                r.provider === "deepseek"  ? "rgba(77,166,255,0.1)" :
                                "rgba(0,230,118,0.1)",
                    color: r.provider === "anthropic" ? "var(--amber)" :
                           r.provider === "deepseek"  ? "var(--blue)"  :
                           "var(--green)",
                    border: `1px solid ${
                      r.provider === "anthropic" ? "rgba(255,179,0,0.25)" :
                      r.provider === "deepseek"  ? "rgba(77,166,255,0.25)" :
                      "rgba(0,230,118,0.25)"
                    }`,
                  }}
                >
                  {r.provider[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p
                    className="font-medium text-sm mb-0.5 group-hover:text-white transition-colors"
                    style={{ color: "var(--text)" }}
                  >
                    {r.modelId}
                  </p>
                  <p className="font-mono text-xs" style={{ color: "var(--subtle)" }}>
                    {r.provider} · {r.taskId.slice(0, 12)}…
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                {r.runtimeMs != null && (
                  <span className="font-mono text-xs" style={{ color: "var(--subtle)" }}>
                    {r.runtimeMs}ms
                  </span>
                )}
                <ScoreDisplay score={r.score} />
                <StatusBadge status={r.status} />
                <ChevronRight className="w-4 h-4" style={{ color: "var(--muted)" }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
