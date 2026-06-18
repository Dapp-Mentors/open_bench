"use client";

import { CheckCircle, XCircle, Loader2, Circle, Clock } from "lucide-react";
import type { PipelineLog } from "@/lib/types";

export const PIPELINE_STAGES = [
  { key: "similarity",    label: "Similarity & Diversity",      desc: "Cosine similarity vs approved tasks" },
  { key: "ci",            label: "CI Checks",                   desc: "Container smoke test — exits 0?" },
  { key: "quality",       label: "Quality Check",               desc: "5-criteria LLM score ≥ 0.6" },
  { key: "preflight",     label: "Preflight Validation",        desc: "pytest --collect-only ≥ 6 tests" },
  { key: "oracle_nop",    label: "Oracle / NOP Validation",     desc: "NOP=0 / Oracle=1 container runs" },
  { key: "easiness",      label: "Easiness Prefilter",          desc: "Llama3 must not solve it perfectly" },
  { key: "difficulty",    label: "Difficulty Probe",            desc: "Frontier model 1-3/5 passes" },
  { key: "agent_quality", label: "Agent Quality Check",         desc: "Benchmark designer verdict" },
  { key: "sia_upload",    label: "Sia Network Upload",          desc: "Upload to decentralized storage" },
] as const;

type StageKey = typeof PIPELINE_STAGES[number]["key"];
type StageStatus = "waiting" | "running" | "passed" | "failed";

function getStageStatus(
  key: StageKey,
  logs: PipelineLog[],
  taskStatus: string
): StageStatus {
  const log = logs.find((l) => l.stage === key);
  if (log) return log.passed ? "passed" : "failed";

  const stageIdx = PIPELINE_STAGES.findIndex((s) => s.key === key);
  const lastLog  = logs[logs.length - 1];
  const lastIdx  = PIPELINE_STAGES.findIndex((s) => s.key === lastLog?.stage);

  if (taskStatus === "pipeline_running") {
    if (logs.length === 0 && stageIdx === 0) return "running";
    if (stageIdx === lastIdx + 1) return "running";
  }
  return "waiting";
}

interface Props {
  logs: PipelineLog[];
  taskStatus: string;
}

export function PipelineStages({ logs, taskStatus }: Props) {
  const passedCount = logs.filter((l) => l.passed).length;
  const totalDone   = logs.length;
  const allPassed   = taskStatus === "approved";

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="section-label">Pipeline Progress</span>
          <span className="font-mono text-xs" style={{ color: "var(--subtle)" }}>
            {passedCount} / {PIPELINE_STAGES.length} passed
          </span>
        </div>
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: "var(--muted)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${(passedCount / PIPELINE_STAGES.length) * 100}%`,
              background: allPassed ? "var(--green)" :
                taskStatus === "rejected" ? "var(--red)" : "var(--blue)",
              boxShadow: allPassed ? "0 0 8px var(--green)" :
                taskStatus === "rejected" ? "0 0 8px var(--red)" : "0 0 8px var(--blue)",
            }}
          />
        </div>
      </div>

      {/* Stage list */}
      <div
        className="rounded-lg overflow-hidden border"
        style={{ borderColor: "var(--border)" }}
      >
        {PIPELINE_STAGES.map(({ key, label, desc }, idx) => {
          const status = getStageStatus(key, logs, taskStatus);
          const log    = logs.find((l) => l.stage === key);
          const isLast = idx === PIPELINE_STAGES.length - 1;

          return (
            <div
              key={key}
              className={`flex items-start gap-4 px-5 py-4 transition-colors ${!isLast ? "border-b" : ""}`}
              style={{
                borderColor: "var(--border)",
                background:
                  status === "running" ? "rgba(77,166,255,0.04)" :
                  status === "passed"  ? "rgba(0,230,118,0.02)" :
                  status === "failed"  ? "rgba(255,68,68,0.03)" : "transparent",
              }}
            >
              {/* Icon */}
              <div className="mt-0.5 flex-shrink-0">
                {status === "waiting" && (
                  <Clock className="w-4 h-4" style={{ color: "var(--muted)" }} />
                )}
                {status === "running" && (
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--blue)" }} />
                )}
                {status === "passed" && (
                  <CheckCircle className="w-4 h-4" style={{ color: "var(--green)" }} />
                )}
                {status === "failed" && (
                  <XCircle className="w-4 h-4" style={{ color: "var(--red)" }} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <span
                    className="text-sm font-medium"
                    style={{
                      color:
                        status === "running" ? "var(--blue)" :
                        status === "passed"  ? "var(--text)" :
                        status === "failed"  ? "var(--red)" :
                        "var(--subtle)",
                    }}
                  >
                    {label}
                  </span>
                  <span className="font-mono text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="text-xs mb-1" style={{ color: "var(--subtle)" }}>{desc}</p>
                {log && (
                  <p
                    className="font-mono text-xs mt-1 py-1 px-2 rounded"
                    style={{
                      color: log.passed ? "var(--green)" : "var(--red)",
                      background: log.passed ? "rgba(0,230,118,0.06)" : "rgba(255,68,68,0.06)",
                      border: `1px solid ${log.passed ? "rgba(0,230,118,0.15)" : "rgba(255,68,68,0.15)"}`,
                    }}
                  >
                    {log.message}
                  </p>
                )}
                {status === "running" && (
                  <p className="font-mono text-xs mt-1" style={{ color: "var(--blue)" }}>
                    <span className="animate-pulse">executing…</span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
