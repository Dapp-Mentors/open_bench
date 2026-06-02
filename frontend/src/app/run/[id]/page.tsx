"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { LogTerminal } from "@/components/LogTerminal";
import { StatusBadge } from "@/components/StatusBadge";
import { ScoreDisplay } from "@/components/ScoreDisplay";
import { SiaProof } from "@/components/SiaProof";
import type { BenchmarkRun } from "@/lib/types";

const PROVIDER_COLOR: Record<string, string> = {
  ollama:    "var(--green)",
  anthropic: "var(--amber)",
  deepseek:  "var(--blue)",
};

export default function RunDetail({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<BenchmarkRun | null>(null);

  const fetchRun = useCallback(async () => {
    const res = await fetch(`/api/runs/${params.id}`);
    if (res.ok) setRun(await res.json());
  }, [params.id]);

  useEffect(() => { fetchRun(); }, [fetchRun]);

  useEffect(() => {
    if (!run) return;
    if (run.status === "completed" || run.status === "failed") return;
    const t = setInterval(fetchRun, 1500);
    return () => clearInterval(t);
  }, [run?.status, fetchRun]);

  if (!run) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 font-mono text-sm" style={{ color: "var(--subtle)" }}>
        <span className="animate-pulse">▋</span> Loading…
      </div>
    );
  }

  const isDone    = run.status === "completed" || run.status === "failed";
  const isLive    = run.status === "running";
  const provColor = PROVIDER_COLOR[run.provider] ?? "var(--text)";

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-mono mb-6 transition-colors" style={{ color: "var(--subtle)" }}>
        <ArrowLeft className="w-3.5 h-3.5" />
        Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <div className="section-label mb-2">Benchmark Run</div>
          <div className="flex items-center gap-3 mb-1">
            <span
              className="font-mono text-xs px-2 py-0.5 rounded"
              style={{ background: `${provColor}15`, color: provColor, border: `1px solid ${provColor}30` }}
            >
              {run.provider}
            </span>
            <h1 className="font-display text-xl font-bold" style={{ color: "var(--text)" }}>
              {run.modelId}
            </h1>
          </div>
          <p className="font-mono text-xs" style={{ color: "var(--subtle)" }}>{run.id}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          {isDone && run.score != null ? (
            <ScoreDisplay score={run.score} size="lg" />
          ) : (
            <StatusBadge status={run.status} />
          )}
        </div>
      </div>

      {/* Live log terminal */}
      <div className="mb-6">
        <LogTerminal logs={run.logs ?? []} isLive={isLive} />
      </div>

      {/* Result card */}
      {isDone && (
        <div className="bench-card rounded-lg p-5 mb-4">
          <div className="section-label mb-4">Run Results</div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <div>
              <div className="section-label mb-1">Status</div>
              <StatusBadge status={run.status} />
            </div>
            <div>
              <div className="section-label mb-1">Score</div>
              <ScoreDisplay score={run.score} />
            </div>
            <div>
              <div className="section-label mb-1">Runtime</div>
              <span className="font-mono text-sm" style={{ color: "var(--text)" }}>
                {run.runtimeMs != null ? `${run.runtimeMs}ms` : "—"}
              </span>
            </div>
            <div>
              <div className="section-label mb-1">Token Usage</div>
              <span className="font-mono text-sm" style={{ color: "var(--text)" }}>
                {run.tokenUsage != null ? run.tokenUsage.toLocaleString() : "—"}
              </span>
            </div>
            <div>
              <div className="section-label mb-1">Task ID</div>
              <Link
                href={`/tasks/${run.taskId}`}
                className="inline-flex items-center gap-1 font-mono text-xs"
                style={{ color: "var(--blue)" }}
              >
                {run.taskId.slice(0, 16)}…
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <div>
              <div className="section-label mb-1">Created</div>
              <span className="font-mono text-xs" style={{ color: "var(--subtle)" }}>
                {new Date(run.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sia proof */}
      {run.siaHash && <SiaProof siaHash={run.siaHash} indexdKey={run.indexdKey} />}

      {/* Actions */}
      {isDone && (
        <div className="flex gap-3 mt-6">
          <Link
            href={`/run/new?taskId=${run.taskId}`}
            className="bench-btn-ghost flex items-center gap-2 px-4 py-2 rounded text-xs"
          >
            Run Again with Different Model
          </Link>
          <Link
            href="/dashboard"
            className="bench-btn-ghost flex items-center gap-2 px-4 py-2 rounded text-xs"
          >
            Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
