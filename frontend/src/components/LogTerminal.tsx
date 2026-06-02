"use client";

import { useEffect, useRef } from "react";
import type { RunLog } from "@/lib/types";

interface Props {
  logs: RunLog[];
  isLive?: boolean;
}

export function LogTerminal({ logs, isLive = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div
      className="log-terminal rounded-lg overflow-hidden"
      style={{ border: "1px solid var(--border)" }}
    >
      {/* Terminal header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--red)",   opacity: 0.7 }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--amber)", opacity: 0.7 }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--green)", opacity: 0.7 }} />
        </div>
        <span className="font-mono text-xs ml-2" style={{ color: "var(--subtle)" }}>
          container output
        </span>
        {isLive && (
          <div className="ml-auto flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--green)" }}
            />
            <span className="font-mono text-xs" style={{ color: "var(--green)" }}>LIVE</span>
          </div>
        )}
      </div>

      {/* Log content */}
      <div className="p-4 h-72 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="flex items-center gap-2" style={{ color: "var(--muted)" }}>
            <span className="animate-pulse">▋</span>
            <span>Waiting for output…</span>
          </div>
        ) : (
          logs.map((l, i) => (
            <div
              key={l.id ?? i}
              className="font-mono text-xs leading-relaxed"
              style={{
                color: l.stream === "stderr" ? "var(--red)" : "var(--green)",
                opacity: l.stream === "stderr" ? 0.9 : 1,
              }}
            >
              <span style={{ color: "var(--subtle)", userSelect: "none" }}>
                {l.stream === "stderr" ? "ERR " : "OUT "}
              </span>
              {l.line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
