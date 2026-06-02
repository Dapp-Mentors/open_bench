type Status = string;

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  pending:          { bg: "rgba(90,96,114,0.15)",  color: "var(--subtle)",  label: "pending"   },
  pipeline_running: { bg: "rgba(77,166,255,0.12)", color: "var(--blue)",    label: "running"   },
  approved:         { bg: "rgba(0,230,118,0.12)",  color: "var(--green)",   label: "approved"  },
  rejected:         { bg: "rgba(255,68,68,0.12)",  color: "var(--red)",     label: "rejected"  },
  running:          { bg: "rgba(77,166,255,0.12)", color: "var(--blue)",    label: "running"   },
  completed:        { bg: "rgba(0,230,118,0.12)",  color: "var(--green)",   label: "completed" },
  failed:           { bg: "rgba(255,68,68,0.12)",  color: "var(--red)",     label: "failed"    },
};

export function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const isPulsing = status === "pipeline_running" || status === "running";

  return (
    <span
      className="badge inline-flex items-center gap-1.5"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}
    >
      {isPulsing && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: cfg.color }}
        />
      )}
      {cfg.label}
    </span>
  );
}
