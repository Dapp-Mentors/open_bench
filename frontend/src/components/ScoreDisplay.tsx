interface Props {
  score: number | null | undefined;
  size?: "sm" | "lg";
}

export function ScoreDisplay({ score, size = "sm" }: Props) {
  if (score == null) return <span style={{ color: "var(--subtle)" }}>—</span>;

  const pct     = Math.round(score * 100);
  const isPassed = score === 1.0;
  const color   = isPassed ? "var(--green)" : score >= 0.5 ? "var(--amber)" : "var(--red)";

  if (size === "lg") {
    return (
      <div className="flex flex-col items-end">
        <div
          className="font-display font-bold leading-none"
          style={{ fontSize: "3.5rem", color, textShadow: `0 0 20px ${color}50` }}
        >
          {pct}
          <span className="text-2xl">%</span>
        </div>
        <span
          className="font-mono text-xs mt-1"
          style={{ color }}
        >
          {isPassed ? "PASS" : "FAIL"}
        </span>
      </div>
    );
  }

  return (
    <span
      className="font-mono font-bold text-sm"
      style={{ color }}
    >
      {pct}%
    </span>
  );
}
