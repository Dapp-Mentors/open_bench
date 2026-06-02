"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Info } from "lucide-react";
import type { ScoringType } from "@/lib/types";

interface FormState {
  title:           string;
  description:     string;
  scoringType:     ScoringType;
  expectedOutput:  string;
  expectedPattern: string;
  timeoutMs:       number;
}

const SCORING_OPTIONS: { value: ScoringType; label: string; desc: string }[] = [
  { value: "passfail", label: "Pass / Fail",         desc: "Container exits with code 0" },
  { value: "diff",     label: "Exact Output Match",  desc: "stdout matches expected exactly" },
  { value: "regex",    label: "Regex Pattern Match", desc: "stdout matches regex pattern" },
];

export default function SubmitTask() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    title:           "",
    description:     "",
    scoringType:     "passfail",
    expectedOutput:  "",
    expectedPattern: "",
    timeoutMs:       30000,
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.description.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Submission failed");
      }
      const { taskId } = await res.json();
      router.push(`/tasks/${taskId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }

  const canSubmit = form.title.trim() && form.description.trim() && !loading;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="section-label mb-2">Curation Pipeline</div>
        <h1 className="font-display text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
          Submit Benchmark Task
        </h1>
        <p className="text-sm" style={{ color: "var(--subtle)" }}>
          Your task will be queued through 5 automated pipeline stages before joining the approved registry.
        </p>
      </div>

      {/* Pipeline info banner */}
      <div
        className="flex items-start gap-3 p-4 rounded-lg mb-8 border"
        style={{
          background: "rgba(77,166,255,0.05)",
          borderColor: "rgba(77,166,255,0.2)",
        }}
      >
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--blue)" }} />
        <div>
          <p className="font-mono text-xs font-semibold mb-1" style={{ color: "var(--blue)" }}>
            5-STAGE CURATION PIPELINE
          </p>
          <p className="text-xs" style={{ color: "var(--subtle)" }}>
            Similarity → CI → Quality (≥0.6) → Easiness Prefilter → Agent Quality Check.
            Tasks failing any stage are rejected with a reason.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="block section-label mb-1.5">Task Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. CSV to JSON converter"
            className="bench-input w-full px-3 py-2.5 rounded-lg text-sm"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block section-label mb-1.5">
            Task Description
            <span className="ml-2 normal-case" style={{ color: "var(--subtle)", letterSpacing: 0 }}>
              (shown verbatim to the agent)
            </span>
          </label>
          <textarea
            rows={6}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Write a Python script that reads /workspace/input.csv and prints its contents as a JSON array to stdout…"
            className="bench-input w-full px-3 py-2.5 rounded-lg text-sm resize-none"
          />
          <p className="text-xs mt-1.5" style={{ color: "var(--subtle)" }}>
            Be precise. The agent only sees this prompt and must produce runnable code.
          </p>
        </div>

        {/* Scoring type */}
        <div>
          <label className="block section-label mb-2">Scoring Method</label>
          <div className="grid grid-cols-3 gap-2">
            {SCORING_OPTIONS.map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => set("scoringType", value)}
                className="text-left p-3 rounded-lg border transition-all"
                style={{
                  background: form.scoringType === value ? "rgba(0,230,118,0.07)" : "var(--surface)",
                  borderColor: form.scoringType === value ? "rgba(0,230,118,0.4)" : "var(--border)",
                  color: "var(--text)",
                }}
              >
                <div
                  className="font-mono text-xs font-semibold mb-1"
                  style={{ color: form.scoringType === value ? "var(--green)" : "var(--text)" }}
                >
                  {label}
                </div>
                <div className="text-xs" style={{ color: "var(--subtle)" }}>{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Conditional fields */}
        {form.scoringType === "diff" && (
          <div>
            <label className="block section-label mb-1.5">Expected Output (exact stdout)</label>
            <textarea
              rows={3}
              value={form.expectedOutput}
              onChange={(e) => set("expectedOutput", e.target.value)}
              placeholder='[{"name": "Alice", "age": "30"}]'
              className="bench-input w-full px-3 py-2.5 rounded-lg text-sm font-mono resize-none"
            />
          </div>
        )}

        {form.scoringType === "regex" && (
          <div>
            <label className="block section-label mb-1.5">Expected Pattern (regex)</label>
            <input
              type="text"
              value={form.expectedPattern}
              onChange={(e) => set("expectedPattern", e.target.value)}
              placeholder="def [a-z_]+\("
              className="bench-input w-full px-3 py-2.5 rounded-lg text-sm font-mono"
            />
          </div>
        )}

        {/* Timeout */}
        <div>
          <label className="block section-label mb-1.5">
            Timeout (ms)
            <span className="ml-2 normal-case" style={{ color: "var(--subtle)", letterSpacing: 0 }}>
              container hard limit
            </span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={form.timeoutMs}
              onChange={(e) => set("timeoutMs", Number(e.target.value))}
              min={5000}
              max={120000}
              step={5000}
              className="bench-input w-40 px-3 py-2.5 rounded-lg text-sm font-mono"
            />
            <span className="text-xs" style={{ color: "var(--subtle)" }}>
              {(form.timeoutMs / 1000).toFixed(0)}s · recommended: 30000ms
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="p-3 rounded-lg border text-sm font-mono"
            style={{
              background: "rgba(255,68,68,0.07)",
              borderColor: "rgba(255,68,68,0.3)",
              color: "var(--red)",
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bench-btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "#0a0b0d", borderTopColor: "transparent" }} />
              Submitting…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit → Run Pipeline
            </>
          )}
        </button>
      </div>
    </div>
  );
}
