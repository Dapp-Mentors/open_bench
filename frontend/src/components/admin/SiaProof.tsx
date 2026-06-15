"use client";

/**
 * SiaProof — per-task Sia pipeline detail panel.
 *
 * Shown inside the expanded task row in the admin review queue.
 * Renders a 4-step pipeline UI driven by the task's siaStatus field
 * (set by the backend background Sia upload pipeline).
 */

import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  CloudUpload,
  Pin,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import type { SiaLog } from "@/lib/types";

// ── Step metadata ─────────────────────────────────────────────────────────────

const STEP_META: Record<string, { label: string; description: string; icon: React.ElementType }> = {
  queued: {
    label: "Queued",
    description: "Waiting to start",
    icon: Clock,
  },
  uploading: {
    label: "Uploading to Sia",
    description: "Transferring encrypted shards",
    icon: CloudUpload,
  },
  pinning: {
    label: "Pinning on Indexer",
    description: "Registering object with indexer",
    icon: Pin,
  },
  ready: {
    label: "Ready",
    description: "Pinned and downloadable",
    icon: Sparkles,
  },
};

const STEP_ORDER = ["queued", "uploading", "pinning", "ready"];

// ── Step row ──────────────────────────────────────────────────────────────────

type StepState = "complete" | "failed" | "active" | "pending";

interface StepRowProps {
  stepKey: string;
  log: SiaLog | undefined;
  state: StepState;
  isLast: boolean;
}

function StepRow({ stepKey, log, state, isLast }: StepRowProps) {
  const meta = STEP_META[stepKey] ?? { label: stepKey, description: "", icon: CloudUpload };
  const Icon = meta.icon;

  const color =
    state === "complete" ? "var(--green)"
      : state === "failed" ? "var(--red)"
        : state === "active" ? "var(--blue)"
          : "var(--muted)";

  const formattedTs = log?.ts
    ? new Date(log.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="flex gap-3">
      {/* Icon + connector line */}
      <div className="flex flex-col items-center">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background:
              state === "complete" ? "rgba(0,230,118,0.12)"
                : state === "failed" ? "rgba(255,68,68,0.12)"
                  : state === "active" ? "rgba(77,166,255,0.12)"
                    : "rgba(140,148,168,0.12)",
            border:
              state === "pending"
                ? "1px solid rgba(140,148,168,0.35)"
                : `1px solid ${color}44`,
          }}
        >
          {state === "complete" ? (
            <CheckCircle2 className="w-4 h-4" style={{ color: "var(--green)" }} />
          ) : state === "failed" ? (
            <XCircle className="w-4 h-4" style={{ color: "var(--red)" }} />
          ) : state === "active" ? (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--blue)" }} />
          ) : (
            <Icon className="w-3.5 h-3.5" style={{ color: "var(--text-subtle)" }} />
          )}
        </div>
        {!isLast && (
          <div
            className="w-px flex-1 mt-1"
            style={{
              background:
                state === "complete" ? "rgba(0,230,118,0.3)"
                  : state === "failed" ? "rgba(255,68,68,0.2)"
                    : "rgba(140,148,168,0.25)",
              minHeight: 20,
            }}
          />
        )}
      </div>

      {/* Text */}
      <div className="pb-4 pt-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-mono text-xs font-semibold"
            style={{ color: state === "pending" ? "var(--text-muted)" : "var(--text)" }}
          >
            {meta.label}
          </span>
          {formattedTs && (
            <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
              {formattedTs}
            </span>
          )}
          {state === "active" && (
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--blue)" }}
            />
          )}
        </div>
        <p className="font-mono text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
          {log?.message || meta.description}
        </p>
        {/* Progress bar under completed / active steps */}
        {(state === "complete" || state === "active") && (
          <div
            className="mt-1.5 h-0.5 rounded-full transition-all duration-700"
            style={{
              background:
                state === "complete"
                  ? "rgba(0,230,118,0.35)"
                  : "rgba(77,166,255,0.35)",
              width: state === "complete" ? "100%" : "60%",
              maxWidth: 200,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ── State resolution ──────────────────────────────────────────────────────────

function resolveState(
  stepKey: string,
  completedSteps: Set<string>,
  failedSteps: Set<string>,
  siaStatus: string,
): StepState {
  if (failedSteps.has(stepKey)) return "failed";
  if (completedSteps.has(stepKey)) return "complete";
  if (stepKey === siaStatus) return "active";
  const stepIdx = STEP_ORDER.indexOf(stepKey);
  const activeIdx = STEP_ORDER.indexOf(siaStatus);
  if (activeIdx > stepIdx) return "complete";
  return "pending";
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  siaHash?: string | null;
  indexdKey?: string | null;
  siaStatus?: string | null;
  siaLogs?: SiaLog[];
}

export function SiaProof({ siaHash, indexdKey, siaStatus, siaLogs }: Props) {
  const status = siaStatus ?? "pending";
  const logs = siaLogs ?? [];

  // Don't render if the Sia push hasn't been triggered yet
  const hasData = siaHash || indexdKey || logs.length > 0 || status !== "pending";
  if (!hasData) return null;

  // Derive real upload state from data presence (more reliable than status alone)
  const hasUploaded = !!siaHash;
  const hasPinned = !!indexdKey;

  const logByStep = Object.fromEntries(logs.map((l) => [l.step, l]));
  const completedSteps = new Set(logs.filter((l) => l.passed === true).map((l) => l.step));
  const failedSteps = new Set(logs.filter((l) => l.passed === false).map((l) => l.step));

  // Badge colour: prefer data-derived state over siaStatus field
  const headerColor =
    hasUploaded && hasPinned ? "var(--green)"
      : hasUploaded ? "var(--blue)"
        : status === "ready" ? "var(--green)"
          : status === "failed" ? "var(--red)"
            : status === "pending" ? "var(--amber)"
              : "var(--blue)";

  // Badge label: if siaHash exists the file is already on Sia — don't lie.
  const headerLabel =
    hasUploaded && hasPinned ? "Ready"
      : hasUploaded ? "Pinning…"
        : status === "ready" ? "Ready"
          : status === "failed" ? "Failed"
            : status === "pending" ? "Awaiting upload"
              : status === "queued" ? "Queued"
                : status === "uploading" ? "Uploading…"
                  : status === "pinning" ? "Pinning…"
                    : "Uploading…";

  // Active (spinner) if the pipeline isn't in a terminal state or is partially done
  const isActive =
    status === "queued" || status === "uploading" || status === "pinning" ||
    (hasUploaded && !hasPinned);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="section-label">Sia Network</div>
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-xs"
          style={{
            background: `${headerColor}12`,
            border: `1px solid ${headerColor}30`,
            color: headerColor,
          }}
        >
          {isActive && <Loader2 className="w-3 h-3 animate-spin" />}
          {headerLabel}
        </span>
      </div>

      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid rgba(0,188,212,0.15)", background: "rgba(0,188,212,0.02)" }}
      >
        {/* Pipeline steps */}
        <div className="px-4 pt-4 pb-1">
          {STEP_ORDER.map((stepKey, idx) => (
            <StepRow
              key={stepKey}
              stepKey={stepKey}
              log={logByStep[stepKey]}
              state={resolveState(stepKey, completedSteps, failedSteps, status)}
              isLast={idx === STEP_ORDER.length - 1}
            />
          ))}
        </div>

        {/* Metadata strip — shown once siaHash / indexdKey are present */}
        {(siaHash || indexdKey) && (
          <div
            className="border-t px-4 py-3 space-y-2"
            style={{ borderColor: "rgba(0,188,212,0.12)" }}
          >
            {siaHash && (
              <div className="flex items-start gap-2">
                <span className="section-label w-24 flex-shrink-0 pt-0.5">Sia Object</span>
                <span className="font-mono text-xs break-all" style={{ color: "var(--text-muted)" }}>
                  {siaHash}
                </span>
              </div>
            )}
            {indexdKey && (
              <div className="flex items-start gap-2">
                <span className="section-label w-24 flex-shrink-0 pt-0.5">Indexd CID</span>
                <span className="font-mono text-xs break-all flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                  {indexdKey}
                  <a
                    href={`https://indexd.example.com/${indexdKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" style={{ color: "var(--cyan)" }} />
                  </a>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}