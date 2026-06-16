"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings2, Save, RefreshCw, Check, Search, ChevronDown,
  Zap, Shield, Eye, Brain, Loader2, ExternalLink,
} from "lucide-react";
import type { ModelConfig, ModelConfigKey, OpenRouterModel } from "@/lib/types";

// ── Role definitions ──────────────────────────────────────────────────────────

const MODEL_ROLES: {
  key: ModelConfigKey;
  label: string;
  description: string;
  icon: typeof Shield;
  color: string;
  bgColor: string;
  borderColor: string;
}[] = [
  {
    key: "frontier_model",
    label: "Frontier Model",
    description: "Strongest model used for the difficulty probe (Stage 7). Tests whether tasks are appropriately challenging.",
    icon: Shield,
    color: "var(--green)",
    bgColor: "rgba(0,230,118,0.06)",
    borderColor: "rgba(0,230,118,0.2)",
  },
  {
    key: "easiness_model",
    label: "Easiness Model",
    description: "Fast model used for the easiness prefilter (Stage 6). Determines if a task is too easy or too hard.",
    icon: Zap,
    color: "var(--blue)",
    bgColor: "rgba(77,166,255,0.06)",
    borderColor: "rgba(77,166,255,0.2)",
  },
  {
    key: "quality_model",
    label: "Quality Model",
    description: "Evaluates task quality across 11 criteria (Stage 3). Scores instruction clarity, scope, reproducibility, and more.",
    icon: Eye,
    color: "var(--amber)",
    bgColor: "rgba(251,191,36,0.06)",
    borderColor: "rgba(251,191,36,0.2)",
  },
  {
    key: "agent_quality_model",
    label: "Agent Quality Model",
    description: "Evaluates instruction realism and absence of leaked assertions (Stage 8). Stricter than the general quality check.",
    icon: Brain,
    color: "#c084fc",
    bgColor: "rgba(192,132,252,0.06)",
    borderColor: "rgba(192,132,252,0.2)",
  },
];

const PRICING_COLORS: Record<string, string> = {
  free: "var(--green)",
  low: "var(--blue)",
  medium: "var(--amber)",
  high: "var(--red)",
};

const PRICING_LABELS: Record<string, string> = {
  free: "Free",
  low: "Low cost",
  medium: "Medium cost",
  high: "High cost",
};

// ── Page component ────────────────────────────────────────────────────────────

export default function ModelSettingsPage() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedRole, setExpandedRole] = useState<ModelConfigKey | null>(null);
  const [dirty, setDirty] = useState<Set<ModelConfigKey>>(new Set());
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Fetch current config + available models
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, modelsRes] = await Promise.all([
        fetch("/api/models/config"),
        fetch("/api/models"),
      ]);
      const configData = await configRes.json();
      const modelsData = await modelsRes.json();
      setConfigs(Array.isArray(configData) ? configData : []);
      setModels(Array.isArray(modelsData) ? modelsData : []);
    } catch {
      setConfigs([]);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Get current model for a role
  const getConfig = (key: ModelConfigKey): ModelConfig | undefined =>
    configs.find((c) => c.key === key);

  // Select a model for a role
  const selectModel = (key: ModelConfigKey, modelId: string, modelName: string) => {
    setConfigs((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        return prev.map((c) => (c.key === key ? { ...c, modelId, modelName } : c));
      }
      return [...prev, { key, modelId, modelName }];
    });
    setDirty((prev) => new Set(prev).add(key));
    setExpandedRole(null);
  };

  // Save a single role's config
  const saveConfig = async (key: ModelConfigKey) => {
    const config = getConfig(key);
    if (!config) return;

    setSaving(key);
    try {
      const res = await fetch("/api/models/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          modelId: config.modelId,
          modelName: config.modelName,
        }),
      });

      if (res.ok) {
        setDirty((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setToast({ type: "success", msg: `${MODEL_ROLES.find((r) => r.key === key)?.label} updated` });
      } else {
        setToast({ type: "error", msg: "Failed to save" });
      }
    } catch {
      setToast({ type: "error", msg: "Network error" });
    } finally {
      setSaving(null);
    }
  };

  // Filter models by search
  const filteredModels = models.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.modelId.toLowerCase().includes(q) ||
      m.modelName.toLowerCase().includes(q)
    );
  });

  // Group models by provider
  const groupedModels = filteredModels.reduce(
    (acc, m) => {
      const provider = m.modelId.split("/")[0] || "other";
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(m);
      return acc;
    },
    {} as Record<string, OpenRouterModel[]>
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center py-20 font-mono text-sm" style={{ color: "var(--subtle)" }}>
          <span className="animate-pulse">▋</span> Loading model configuration…
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
            Model Configuration
          </h1>
          <p className="text-xs mt-1.5" style={{ color: "var(--subtle)" }}>
            Select which OpenRouter model powers each pipeline stage. All LLM calls route through OpenRouter.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Info banner */}
      <div
        className="mb-8 px-4 py-3 rounded-lg flex items-start gap-3"
        style={{
          background: "rgba(77,166,255,0.04)",
          border: "1px solid rgba(77,166,255,0.15)",
        }}
      >
        <ExternalLink className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--blue)" }} />
        <div className="text-xs" style={{ color: "var(--subtle)" }}>
          All models are accessed via{" "}
          <a href="https://openrouter.ai" target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>
            OpenRouter
          </a>
          . Set your{" "}
          <code className="px-1 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--text)" }}>
            OPENROUTER_API_KEY
          </code>{" "}
          in the backend <code className="px-1 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--text)" }}>.env</code> to enable model access.
        </div>
      </div>

      {/* Model role cards */}
      <div className="space-y-4">
        {MODEL_ROLES.map((role) => {
          const config = getConfig(role.key);
          const isExpanded = expandedRole === role.key;
          const isDirty = dirty.has(role.key);
          const isSaving = saving === role.key;
          const Icon = role.icon;

          return (
            <div
              key={role.key}
              className="bench-card rounded-lg overflow-hidden"
              style={{ border: `1px solid ${isDirty ? role.borderColor : "var(--border)"}` }}
            >
              {/* Role header */}
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
                    style={{ background: role.bgColor, border: `1px solid ${role.borderColor}` }}
                  >
                    <Icon className="w-4.5 h-4.5" style={{ color: role.color }} />
                  </div>
                  <div>
                    <h3 className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                      {role.label}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                      {role.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Current model badge */}
                  {config && (
                    <div
                      className="px-3 py-1.5 rounded font-mono text-xs"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    >
                      {config.modelName}
                      <span className="ml-1.5" style={{ color: "var(--subtle)" }}>
                        ({config.modelId})
                      </span>
                    </div>
                  )}

                  {/* Select button */}
                  <button
                    onClick={() => setExpandedRole(isExpanded ? null : role.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                    style={{
                      background: isExpanded ? role.bgColor : "var(--surface)",
                      color: isExpanded ? role.color : "var(--subtle)",
                      border: `1px solid ${isExpanded ? role.borderColor : "var(--border)"}`,
                    }}
                  >
                    <ChevronDown
                      className="w-3.5 h-3.5 transition-transform"
                      style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                    />
                    Change
                  </button>

                  {/* Save button */}
                  {isDirty && (
                    <button
                      onClick={() => saveConfig(role.key)}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                      style={{
                        background: role.bgColor,
                        color: role.color,
                        border: `1px solid ${role.borderColor}`,
                        opacity: isSaving ? 0.5 : 1,
                      }}
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Save className="w-3.5 h-3.5" />
                      )}
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                  )}
                </div>
              </div>

              {/* Model picker dropdown */}
              {isExpanded && (
                <div className="border-t px-5 py-4" style={{ borderColor: "var(--border)", background: "rgba(255,255,255,0.01)" }}>
                  {/* Search */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--subtle)" }} />
                    <input
                      type="text"
                      placeholder="Search models…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg font-mono text-xs"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        outline: "none",
                      }}
                    />
                  </div>

                  {/* Model list */}
                  <div className="max-h-80 overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: "thin" }}>
                    {Object.entries(groupedModels).map(([provider, providerModels]) => (
                      <div key={provider}>
                        <div className="section-label mb-1.5 text-[10px] uppercase tracking-wider">
                          {provider}
                        </div>
                        <div className="space-y-1">
                          {providerModels.map((model) => {
                            const isSelected = config?.modelId === model.modelId;
                            return (
                              <button
                                key={model.modelId}
                                onClick={() => selectModel(role.key, model.modelId, model.modelName)}
                                className="w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-all"
                                style={{
                                  background: isSelected ? role.bgColor : "transparent",
                                  border: isSelected ? `1px solid ${role.borderColor}` : "1px solid transparent",
                                  color: isSelected ? role.color : "var(--text)",
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.background = "var(--surface)";
                                    e.currentTarget.style.borderColor = "var(--border)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) {
                                    e.currentTarget.style.background = "transparent";
                                    e.currentTarget.style.borderColor = "transparent";
                                  }
                                }}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                                  <div className="min-w-0">
                                    <div className="font-mono text-xs font-medium truncate">
                                      {model.modelName}
                                    </div>
                                    <div className="font-mono text-[10px] truncate" style={{ color: "var(--subtle)" }}>
                                      {model.modelId}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-[10px] font-mono" style={{ color: "var(--subtle)" }}>
                                    {(model.context / 1000).toFixed(0)}K ctx
                                  </span>
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                                    style={{
                                      background: `${PRICING_COLORS[model.pricing] || "var(--subtle)"}15`,
                                      color: PRICING_COLORS[model.pricing] || "var(--subtle)",
                                    }}
                                  >
                                    {PRICING_LABELS[model.pricing] || model.pricing}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {filteredModels.length === 0 && (
                      <div className="text-center py-6 font-mono text-xs" style={{ color: "var(--subtle)" }}>
                        No models match your search
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}