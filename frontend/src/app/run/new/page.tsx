"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Play, Zap } from "lucide-react";
import Link from "next/link";
import type { Task, ModelOption } from "@/lib/types";

const PROVIDER_META: Record<string, { label: string; color: string; note?: string }> = {
  ollama:    { label: "Local · Ollama",    color: "var(--green)", note: "No API key required" },
  anthropic: { label: "Anthropic",         color: "var(--amber)", note: "Requires ANTHROPIC_API_KEY" },
  deepseek:  { label: "DeepSeek",          color: "var(--blue)",  note: "Requires DEEPSEEK_API_KEY" },
};

export default function NewRun() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [tasks,    setTasks]   = useState<Task[]>([]);
  const [models,   setModels]  = useState<ModelOption[]>([]);
  const [taskId,   setTaskId]  = useState(searchParams.get("taskId") ?? "");
  const [selected, setSelected]= useState<ModelOption | null>(null);
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tasks?status=approved").then((r) => r.json()).then((t) => setTasks(Array.isArray(t) ? t : []));
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

  const selectedTask = tasks.find((t) => t.id === taskId);

  async function handleStart() {
    if (!taskId || !selected) return;
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
      const { runId } = await res.json();
      router.push(`/run/${runId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-mono mb-6 transition-colors" style={{ color: "var(--subtle)" }}>
        <ArrowLeft className="w-3.5 h-3.5" />
        Dashboard
      </Link>

      <div className="mb-8">
        <div className="section-label mb-2">Benchmark Runner</div>
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text)" }}>
          Run Benchmark
        </h1>
      </div>

      <div className="space-y-6">
        {/* Task selector */}
        <div>
          <label className="block section-label mb-2">Approved Task</label>
          {tasks.length === 0 ? (
            <div className="bench-card rounded-lg p-4 text-sm" style={{ color: "var(--subtle)" }}>
              No approved tasks yet.{" "}
              <Link href="/tasks/submit" style={{ color: "var(--green)" }}>Submit one →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTaskId(t.id)}
                  className="w-full text-left p-4 rounded-lg border transition-all"
                  style={{
                    background: taskId === t.id ? "rgba(0,230,118,0.05)" : "var(--surface)",
                    borderColor: taskId === t.id ? "rgba(0,230,118,0.35)" : "var(--border)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{t.title}</span>
                    <span className="font-mono text-xs" style={{ color: "var(--subtle)" }}>{t.scoringType}</span>
                  </div>
                  <p className="font-mono text-xs mt-1 truncate" style={{ color: "var(--subtle)" }}>
                    {t.description.slice(0, 80)}…
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Model selector */}
        <div>
          <label className="block section-label mb-2">Model</label>
          <div className="space-y-3">
            {(["ollama", "anthropic", "deepseek"] as const).map((provider) => {
              const meta   = PROVIDER_META[provider];
              const mods   = grouped[provider];
              if (mods.length === 0) return null;
              return (
                <div key={provider}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-xs font-semibold" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    {meta.note && (
                      <span className="text-xs" style={{ color: "var(--subtle)" }}>· {meta.note}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {mods.map((m) => {
                      const isSelected = selected?.modelId === m.modelId && selected?.provider === m.provider;
                      return (
                        <button
                          key={m.modelId}
                          type="button"
                          onClick={() => setSelected(m)}
                          className="text-left px-4 py-3 rounded-lg border transition-all"
                          style={{
                            background: isSelected ? `${meta.color}10` : "var(--surface)",
                            borderColor: isSelected ? `${meta.color}40` : "var(--border)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected && <Zap className="w-3 h-3 flex-shrink-0" style={{ color: meta.color }} />}
                            <span
                              className="font-mono text-xs font-medium"
                              style={{ color: isSelected ? meta.color : "var(--text)" }}
                            >
                              {m.label}
                            </span>
                          </div>
                          <div className="font-mono text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                            {m.modelId}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        {taskId && selected && selectedTask && (
          <div
            className="p-4 rounded-lg border"
            style={{ background: "rgba(0,230,118,0.04)", borderColor: "rgba(0,230,118,0.2)" }}
          >
            <div className="section-label mb-2" style={{ color: "var(--green)" }}>Run Summary</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
              <span style={{ color: "var(--subtle)" }}>Task:</span>
              <span style={{ color: "var(--text)" }}>{selectedTask.title}</span>
              <span style={{ color: "var(--subtle)" }}>Model:</span>
              <span style={{ color: "var(--text)" }}>{selected.label}</span>
              <span style={{ color: "var(--subtle)" }}>Scoring:</span>
              <span style={{ color: "var(--text)" }}>{selectedTask.scoringType}</span>
              <span style={{ color: "var(--subtle)" }}>Timeout:</span>
              <span style={{ color: "var(--text)" }}>{selectedTask.timeoutMs}ms</span>
            </div>
          </div>
        )}

        {error && (
          <div
            className="p-3 rounded-lg border text-sm font-mono"
            style={{ background: "rgba(255,68,68,0.07)", borderColor: "rgba(255,68,68,0.3)", color: "var(--red)" }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={loading || !taskId || !selected}
          className="bench-btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "#0a0b0d", borderTopColor: "transparent" }} />
              Starting…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Run →
            </>
          )}
        </button>
      </div>
    </div>
  );
}
