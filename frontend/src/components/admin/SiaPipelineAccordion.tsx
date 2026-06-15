"use client";

/**
 * SiaPipelineAccordion
 *
 * Renders an expandable accordion inside the BenchmarkCards "Platform Overview"
 * section that shows the Sia push pipeline status for approved tasks.
 *
 * Each step has one of three visual states:
 *   ✓ complete (green)   — the step has passed
 *   ✗ failed  (red)      — the step errored
 *   ○ active  (blue)     — currently in progress (spinning)
 *   ○ pending (muted)    — not yet reached
 *
 * Props:
 *   sia  — the BenchmarkStats.sia sub-object
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  CloudUpload,
  Pin,
  Sparkles,
} from "lucide-react";
import type { SiaStats } from "@/components/admin/BenchmarkCards";

// ── Step metadata ─────────────────────────────────────────────────────────────

interface StepMeta {
  key: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

const STEPS: StepMeta[] = [
  {
    key: "queued",
    label: "Queued",
    description: "Waiting to start",
    icon: Clock,
  },
  {
    key: "uploading",
    label: "Uploading to Sia",
    description: "Transferring encrypted shards",
    icon: CloudUpload,
  },
  {
    key: "pinning",
    label: "Pinning on Indexer",
    description: "Registering object with indexer",
    icon: Pin,
  },
  {
    key: "ready",
    label: "Ready",
    description: "Pinned and downloadable",
    icon: Sparkles,
  },
];

// ── Status dot ────────────────────────────────────────────────────────────────

type StepStatus = "complete" | "failed" | "active" | "pending";

interface StepRowProps extends StepMeta {
  status: StepStatus;
  isLast: boolean;
}

function StepRow({ label, description, icon: Icon, status, isLast }: StepRowProps) {
  const color =
    status === "complete" ? "var(--green)"
    : status === "failed"   ? "var(--red)"
    : status === "active"   ? "var(--blue)"
    :                         "var(--muted)";

  return (
    <div className="flex gap-3">
      {/* Left: icon + connector line */}
      <div className="flex flex-col items-center">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background:
              status === "complete" ? "rgba(0,230,118,0.12)"
              : status === "failed"   ? "rgba(255,68,68,0.12)"
              : status === "active"   ? "rgba(77,166,255,0.12)"
              :                         "rgba(140,148,168,0.08)",
            border: `1px solid ${color}44`,
          }}
        >
          {status === "complete" ? (
            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--green)" }} />
          ) : status === "failed" ? (
            <XCircle className="w-3.5 h-3.5" style={{ color: "var(--red)" }} />
          ) : status === "active" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--blue)" }} />
          ) : (
            <Icon className="w-3 h-3" style={{ color: "var(--muted)" }} />
          )}
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{
              background:
                status === "complete" ? "rgba(0,230,118,0.25)"
                : status === "failed"   ? "rgba(255,68,68,0.25)"
                :                         "rgba(140,148,168,0.12)",
              minHeight: 16,
            }}
          />
        )}
      </div>

      {/* Right: text */}
      <div className="pb-3 pt-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-xs font-semibold"
            style={{ color: status === "pending" ? "var(--subtle)" : "var(--text)" }}
          >
            {label}
          </span>
          {status === "active" && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--blue)" }}
            />
          )}
        </div>
        <p className="font-mono text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

// ── Sia status → per-step status resolution ───────────────────────────────────

const STEP_ORDER = ["queued", "uploading", "pinning", "ready"];

function resolveStepStatus(
  stepKey: string,
  overallSiaStatus: string | null,
): StepStatus {
  if (!overallSiaStatus || overallSiaStatus === "pending") return "pending";
  if (overallSiaStatus === "failed") return "pending";

  const currentIdx = STEP_ORDER.indexOf(overallSiaStatus);
  const stepIdx = STEP_ORDER.indexOf(stepKey);

  if (stepIdx < currentIdx) return "complete";
  if (stepIdx === currentIdx) return overallSiaStatus === "ready" ? "complete" : "active";
  return "pending";
}

// ── Mini summary badge ────────────────────────────────────────────────────────

function SiaBadge({ sia }: { sia: SiaStats }) {
  const hasActive = sia.uploading + sia.pinning > 0;
  const hasFailed = sia.failed > 0;

  if (sia.total === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {sia.ready > 0 && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs"
          style={{
            background: "rgba(0,230,118,0.08)",
            border: "1px solid rgba(0,230,118,0.2)",
            color: "var(--green)",
          }}
        >
          <CheckCircle2 className="w-3 h-3" />
          {sia.ready} on Sia
        </span>
      )}
      {hasActive && (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-xs"
          style={{
            background: "rgba(77,166,255,0.08)",
            border: "1px solid rgba(77,166,255,0.2)",
            color: "var(--blue)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--blue)" }} />
          {sia.uploading + sia.pinning} uploading
        </span>
      )}
      {hasFailed && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs"
          style={{
            background: "rgba(255,68,68,0.08)",
            border: "1px solid rgba(255,68,68,0.2)",
            color: "var(--red)",
          }}
        >
          <XCircle className="w-3 h-3" />
          {sia.failed} failed
        </span>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function SiaPipelineAccordion({ sia }: { sia: SiaStats }) {
  const [open, setOpen] = useState(false);

  if (!sia || sia.total === 0) return null;

  // Derive an aggregate "current step" for the visual pipeline illustration
  const aggregateStatus: string =
    sia.ready > 0 ? "ready"
    : sia.pinning > 0 ? "pinning"
    : sia.uploading > 0 ? "uploading"
    : sia.failed > 0 ? "failed"
    : "queued";

  const siaReadyPct = sia.total > 0 ? Math.round((sia.ready / sia.total) * 100) : 0;

  return (
    <div
      className="bench-card rounded-lg overflow-hidden"
      style={{ border: "1px solid rgba(0,188,212,0.15)" }}
    >
      {/* ── Header / toggle ── */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        style={{ background: "transparent" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
            style={{
              background: "rgba(0,188,212,0.08)",
              border: "1px solid rgba(0,188,212,0.2)",
            }}
          >
            <CloudUpload className="w-3.5 h-3.5" style={{ color: "var(--cyan)" }} />
          </div>
          <div>
            <span className="font-mono text-xs font-semibold" style={{ color: "var(--text)" }}>
              Sia Network Push
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <SiaBadge sia={sia} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
            {sia.ready}/{sia.total} ready
          </span>
          {open ? (
            <ChevronDown className="w-4 h-4" style={{ color: "var(--subtle)" }} />
          ) : (
            <ChevronRight className="w-4 h-4" style={{ color: "var(--subtle)" }} />
          )}
        </div>
      </button>

      {/* ── Expanded content ── */}
      {open && (
        <div
          className="border-t px-4 py-4"
          style={{ borderColor: "rgba(0,188,212,0.12)", background: "rgba(0,188,212,0.02)" }}
        >
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="section-label">Overall Progress</span>
              <span className="font-mono text-xs" style={{ color: "var(--cyan)" }}>
                {siaReadyPct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(140,148,168,0.15)" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${siaReadyPct}%`,
                  background: "linear-gradient(90deg, var(--cyan), var(--green))",
                }}
              />
            </div>

            {/* Tally row */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2">
              {[
                { label: "Ready", val: sia.ready, color: "var(--green)" },
                { label: "Uploading", val: sia.uploading, color: "var(--blue)" },
                { label: "Pinning", val: sia.pinning, color: "var(--blue)" },
                { label: "Queued", val: sia.queued, color: "var(--muted)" },
                { label: "Pending", val: sia.pending, color: "var(--subtle)" },
                { label: "Failed", val: sia.failed, color: "var(--red)" },
              ]
                .filter((s) => s.val > 0)
                .map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                    <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                      {s.val} {s.label}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Step-by-step pipeline illustration */}
          <div className="section-label mb-3">Pipeline Steps</div>
          <div>
            {STEPS.map(({ key: stepKey, label, description, icon }, idx) => {
              let status: StepStatus;
              if (aggregateStatus === "failed") {
                status = "pending";
              } else {
                status = resolveStepStatus(stepKey, aggregateStatus);
              }

              return (
                <StepRow
                  key={stepKey}
                  label={label}
                  description={description}
                  icon={icon}
                  status={status}
                  isLast={idx === STEPS.length - 1}
                />
              );
            })}
          </div>

          {/* Failed callout */}
          {sia.failed > 0 && (
            <div
              className="mt-3 px-3 py-2.5 rounded text-xs font-mono"
              style={{
                background: "rgba(255,68,68,0.06)",
                border: "1px solid rgba(255,68,68,0.2)",
                color: "var(--red)",
              }}
            >
              {sia.failed} task{sia.failed > 1 ? "s" : ""} failed to push to Sia. Open the task
              detail panel to see the step-level error log.
            </div>
          )}
        </div>
      )}
    </div>
  );
}