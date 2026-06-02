"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Play, ExternalLink } from "lucide-react";
import { PipelineStages } from "@/components/PipelineStages";
import { StatusBadge } from "@/components/StatusBadge";
import { SiaProof } from "@/components/SiaProof";
import type { Task } from "@/lib/types";

export default function TaskDetail({ params }: { params: { id: string } }) {
  const [task, setTask] = useState<Task | null>(null);

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${params.id}`);
    if (res.ok) setTask(await res.json());
  }, [params.id]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  useEffect(() => {
    if (!task) return;
    if (task.status !== "pending" && task.status !== "pipeline_running") return;
    const t = setInterval(fetchTask, 2000);
    return () => clearInterval(t);
  }, [task?.status, fetchTask]);

  if (!task) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center gap-3 font-mono text-sm" style={{ color: "var(--subtle)" }}>
          <span className="animate-pulse">▋</span> Loading…
        </div>
      </div>
    );
  }

  const qualityDetails = task.qualityDetails ? JSON.parse(task.qualityDetails) as Record<string, number> : null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Back */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-mono mb-6 transition-colors"
        style={{ color: "var(--subtle)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="min-w-0">
          <div className="section-label mb-2">Curation Pipeline</div>
          <h1 className="font-display text-xl font-bold mb-1" style={{ color: "var(--text)" }}>
            {task.title}
          </h1>
          <p className="font-mono text-xs" style={{ color: "var(--subtle)" }}>{task.id}</p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          <StatusBadge status={task.status} />
          {task.status === "approved" && (
            <Link
              href={`/run/new?taskId=${task.id}`}
              className="bench-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
            >
              <Play className="w-3 h-3" />
              Run Benchmark
            </Link>
          )}
        </div>
      </div>

      {/* Task description */}
      <div className="bench-card rounded-lg p-5 mb-6">
        <div className="section-label mb-2">Task Description</div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>
          {task.description}
        </p>
        <div className="flex gap-4 mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="section-label mb-0.5">Scoring</div>
            <span className="font-mono text-xs" style={{ color: "var(--cyan)" }}>{task.scoringType}</span>
          </div>
          <div>
            <div className="section-label mb-0.5">Timeout</div>
            <span className="font-mono text-xs" style={{ color: "var(--text)" }}>{task.timeoutMs}ms</span>
          </div>
          {task.expectedOutput && (
            <div className="min-w-0">
              <div className="section-label mb-0.5">Expected Output</div>
              <span className="font-mono text-xs truncate max-w-xs block" style={{ color: "var(--subtle)" }}>
                {task.expectedOutput}
              </span>
            </div>
          )}
          {task.expectedPattern && (
            <div>
              <div className="section-label mb-0.5">Pattern</div>
              <span className="font-mono text-xs" style={{ color: "var(--subtle)" }}>{task.expectedPattern}</span>
            </div>
          )}
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="mb-6">
        <PipelineStages logs={task.pipelineLogs ?? []} taskStatus={task.status} />
      </div>

      {/* Quality score breakdown */}
      {qualityDetails && (
        <div className="bench-card rounded-lg p-5 mb-4">
          <div className="section-label mb-3">Quality Score Breakdown</div>
          <div className="flex items-baseline gap-2 mb-4">
            <span
              className="font-display font-bold text-3xl"
              style={{ color: task.qualityScore! >= 0.6 ? "var(--green)" : "var(--red)" }}
            >
              {((task.qualityScore ?? 0) * 100).toFixed(0)}%
            </span>
            <span className="text-xs font-mono" style={{ color: "var(--subtle)" }}>
              aggregate · threshold: 60%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(qualityDetails).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1.5 px-3 rounded" style={{ background: "var(--muted)" }}>
                <span className="text-xs font-mono" style={{ color: "var(--subtle)" }}>{k}</span>
                <span
                  className="text-xs font-mono font-semibold"
                  style={{ color: (v as number) >= 0.6 ? "var(--green)" : "var(--amber)" }}
                >
                  {((v as number) * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent quality note */}
      {task.agentQualityNote && (
        <div
          className="p-4 rounded-lg mb-4 border"
          style={{ background: "rgba(0,230,118,0.03)", borderColor: "rgba(0,230,118,0.15)" }}
        >
          <div className="section-label mb-2" style={{ color: "var(--green)" }}>Agent Quality Verdict</div>
          <p className="text-sm italic" style={{ color: "var(--text)" }}>"{task.agentQualityNote}"</p>
        </div>
      )}

      {/* Sia proof */}
      {task.siaHash && <SiaProof siaHash={task.siaHash} indexdKey={task.indexdKey} />}

      {/* Recent runs */}
      {task.runs && task.runs.length > 0 && (
        <div className="mt-6">
          <div className="section-label mb-3">Recent Runs</div>
          <div className="space-y-2">
            {task.runs.map((r: any) => (
              <Link
                key={r.id}
                href={`/run/${r.id}`}
                className="bench-card flex items-center justify-between px-4 py-3 rounded-lg group"
              >
                <div>
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{r.modelId}</span>
                  <span className="ml-2 text-xs font-mono" style={{ color: "var(--subtle)" }}>{r.provider}</span>
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
                  <StatusBadge status={r.status} />
                  <ExternalLink className="w-3.5 h-3.5" style={{ color: "var(--muted)" }} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
