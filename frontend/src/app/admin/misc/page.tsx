"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2, Save, RefreshCw, Check, Loader2, RotateCcw,
} from "lucide-react";

// ─── Page component ────────────────────────────────────────────────────────────

export default function MiscSettingsPage() {
  const [difficultyMaxRetries, setDifficultyMaxRetries] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Fetch current settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setDifficultyMaxRetries(data.difficultyMaxRetries ?? 3);
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Save settings
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficultyMaxRetries }),
      });

      if (res.ok) {
        setDirty(false);
        setToast({ type: "success", msg: "Settings saved" });
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", msg: data.error ?? "Failed to save" });
      }
    } catch {
      setToast({ type: "error", msg: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center py-20 font-mono text-sm" style={{ color: "var(--subtle)" }}>
          <span className="animate-pulse">▋</span> Loading settings…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg font-mono text-xs transition-all"
          style={{
            background: toast.type === "success" ? "rgba(0,230,118,0.1)" : "rgba(255,68,68,0.1)",
            border: `1px solid ${toast.type === "success" ? "rgba(0,230,118,0.3)" : "rgba(255,68,68,0.3)"}`,
            color: toast.type === "success" ? "var(--green)" : "var(--red)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          {toast.type === "success" ? <Check className="w-3.5 h-3.5" /> : <span>✕</span>}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="section-label mb-2">Settings</div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--text)" }}>
            <Settings2 className="w-6 h-6" style={{ color: "var(--blue)" }} />
            Misc Settings
          </h1>
          <p className="text-xs mt-1.5" style={{ color: "var(--subtle)" }}>
            Site-wide configuration for pipeline behavior and platform defaults.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchSettings}
            className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all"
              style={{
                background: "rgba(0,230,118,0.1)",
                color: "var(--green)",
                border: "1px solid rgba(0,230,118,0.25)",
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Settings cards */}
      <div className="space-y-4">
        {/* Difficulty Probe Retries */}
        <div
          className="bench-card rounded-lg overflow-hidden"
          style={{ border: `1px solid ${dirty ? "rgba(0,230,118,0.2)" : "var(--border)"}` }}
        >
          <div className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.2)",
                  }}
                >
                  <RotateCcw className="w-4.5 h-4.5" style={{ color: "var(--amber)" }} />
                </div>
                <div>
                  <h3 className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                    Difficulty Probe Max Retries
                  </h3>
                  <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                    Maximum number of times a user can retry the difficulty probe stage (Stage 7) after it fails.
                    Set to 0 to disable retries entirely. The retry button appears on the Difficulty Probe row
                    in the pipeline UI when the stage fails.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setDifficultyMaxRetries((v) => Math.max(0, v - 1));
                    setDirty(true);
                  }}
                  className="w-8 h-8 rounded flex items-center justify-center text-sm font-mono transition-all"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--subtle)",
                  }}
                >
                  −
                </button>
                <div
                  className="w-16 h-10 rounded flex items-center justify-center font-mono text-lg font-bold"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: difficultyMaxRetries === 0 ? "var(--red)" : "var(--text)",
                  }}
                >
                  {difficultyMaxRetries}
                </div>
                <button
                  onClick={() => {
                    setDifficultyMaxRetries((v) => Math.min(10, v + 1));
                    setDirty(true);
                  }}
                  className="w-8 h-8 rounded flex items-center justify-center text-sm font-mono transition-all"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--subtle)",
                  }}
                >
                  +
                </button>
              </div>
              <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                {difficultyMaxRetries === 0
                  ? "Retries disabled"
                  : difficultyMaxRetries === 1
                    ? "1 retry allowed"
                    : `${difficultyMaxRetries} retries allowed`}
              </span>
            </div>
          </div>
        </div>

        {/* Placeholder for future settings */}
        <div
          className="bench-card rounded-lg overflow-hidden border border-dashed"
          style={{ borderColor: "var(--border)", opacity: 0.4 }}
        >
          <div className="px-5 py-6 text-center">
            <p className="font-mono text-xs" style={{ color: "var(--subtle)" }}>
              Additional site-wide settings will appear here in future updates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}