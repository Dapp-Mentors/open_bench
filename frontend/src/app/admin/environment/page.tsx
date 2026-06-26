"use client";

// src/app/admin/environment/page.tsx
// Admin page for viewing/editing environment configuration (Sia, OpenRouter, providers)
// that was initially set up via the setup wizard. Only accessible by super_admin.

import { useState, useEffect, useCallback } from "react";
import {
  Globe, KeyRound, Github, Shield, RefreshCw, Check,
  Loader2, Wifi, WifiOff, Sparkles, ExternalLink, Eye, EyeOff,
} from "lucide-react";

interface EnvSettings {
  // Sia
  siaIndexerUrl: string;
  siaAppId: string;
  siaAppName: string;
  siaAppDescription: string;
  siaConnected: boolean;
  // OpenRouter
  openrouterKey: string;
  hasOpenrouterKey: boolean;
  // Google
  googleClientId: string;
  googleClientSecret: string;
  // GitHub
  githubClientId: string;
  githubClientSecret: string;
  // WebAuthn
  webauthnRpId: string;
  webauthnOrigin: string;
}

export default function EnvironmentPage() {
  const [settings, setSettings] = useState<EnvSettings | null>(null);
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Sia re-registration state
  const [siaRecoveryPhrase, setSiaRecoveryPhrase] = useState("");
  const [siaLoading, setSiaLoading] = useState(false);
  const [siaError, setSiaError] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(false);
  const [siaDirty, setSiaDirty] = useState(false);

  // OpenRouter save state
  const [orSaving, setOrSaving] = useState(false);
  const [orDirty, setOrDirty] = useState(false);

  // Social providers save state
  const [provSaving, setProvSaving] = useState(false);
  const [provDirty, setProvDirty] = useState(false);

  // Fetch current environment settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/environment");
      if (res.ok) {
        const data: EnvSettings = await res.json();
        setSettings(data);
        // Pre-populate the openrouter key from the stored value (super_admin-only route)
        if (data.openrouterKey) {
          setOpenrouterKey(data.openrouterKey);
        }
      }
    } catch {
      // keep defaults
    } finally {
      setLoading(false);
      // Reset per-section dirty flags after fetching fresh data
      setSiaDirty(false);
      setOrDirty(false);
      setProvDirty(false);
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

  // Toggle secret visibility
  const toggleSecret = (field: string) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  // ── Sia re-registration handler ──────────────────────────────────────────

  async function saveSiaSettings() {
    if (!settings) return;
    await fetch("/api/admin/environment", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siaIndexerUrl: settings.siaIndexerUrl,
        siaAppId: settings.siaAppId,
        siaAppName: settings.siaAppName,
        siaAppDescription: settings.siaAppDescription,
        siaConnected: true,
      }),
    });
  }

  async function handleSiaReRegister() {
    if (!settings || !siaRecoveryPhrase.trim()) return;
    setSiaLoading(true);
    setSiaError(null);
    setApprovalUrl(null);
    try {
      const res = await fetch("/api/setup/sia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siaIndexerUrl: settings.siaIndexerUrl.trim(),
          siaAppId: settings.siaAppId.trim(),
          siaAppName: settings.siaAppName.trim(),
          siaAppDescription: settings.siaAppDescription.trim(),
          recovery_phrase: siaRecoveryPhrase.trim(),
        }),
      });

      if (!res.ok) {
        let errorMsg = "Failed to save Sia configuration";
        try {
          const errData = await res.json();
          if (errData?.error) errorMsg = errData.error;
        } catch {
          // ignore parse errors
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();

      if (data.approval_url) {
        setApprovalUrl(data.approval_url);
        return;
      }

      if (data.already_connected) {
        setSiaError("A stored app key was found but the approval URL could not be generated. Please reset the stored key and try again.");
        return;
      }

      setSiaError("Backend did not return an approval URL. Check that the pipeline service has Sia configured correctly.");
    } catch (err) {
      setSiaError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSiaLoading(false);
    }
  }

  async function handleCheckApproval() {
    setCheckingApproval(true);
    try {
      const res = await fetch("/api/setup/sia/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.ok && data.status === "approved") {
        // Auto-save Sia settings to DB on successful approval
        if (settings) {
          setSettings({ ...settings, siaConnected: true });
        }
        await saveSiaSettings();
        setApprovalUrl(null);
        setSiaRecoveryPhrase("");
        setSiaDirty(false);
        setToast({ type: "success", msg: "Sia connected and saved" });
        fetchSettings();
      } else {
        setSiaError("Approval not yet detected. Make sure you've approved the app on the Sia indexer, then try again.");
        setTimeout(() => setSiaError(null), 5000);
      }
    } catch {
      setSiaError("Could not reach the backend. Is the pipeline service running?");
      setTimeout(() => setSiaError(null), 5000);
    } finally {
      setCheckingApproval(false);
    }
  }

  // ── OpenRouter save handler ──────────────────────────────────────────────

  async function handleOpenRouterSave() {
    if (!openrouterKey.trim()) return;
    setOrSaving(true);
    try {
      const res = await fetch("/api/admin/environment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openrouterKey: openrouterKey.trim() }),
      });

      if (res.ok) {
        setOpenrouterKey("");
        setToast({ type: "success", msg: "OpenRouter API key saved" });
        fetchSettings();
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", msg: data.error ?? "Failed to save" });
      }
    } catch {
      setToast({ type: "error", msg: "Network error" });
    } finally {
      setOrSaving(false);
    }
  }

  // ── Social providers save handler ────────────────────────────────────────

  async function handleProvidersSave() {
    if (!settings) return;
    setProvSaving(true);
    try {
      const payload = {
        googleClientId: settings.googleClientId,
        googleClientSecret: settings.googleClientSecret,
        githubClientId: settings.githubClientId,
        githubClientSecret: settings.githubClientSecret,
        webauthnRpId: settings.webauthnRpId,
        webauthnOrigin: settings.webauthnOrigin,
      };

      const res = await fetch("/api/admin/environment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setToast({ type: "success", msg: "Provider settings saved" });
        fetchSettings();
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", msg: data.error ?? "Failed to save" });
      }
    } catch {
      setToast({ type: "error", msg: "Network error" });
    } finally {
      setProvSaving(false);
    }
  }

  // Update a nested field — marks the relevant section as dirty
  const updateField = <K extends keyof EnvSettings>(key: K, value: EnvSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });

    // Mark which section is dirty
    const siaKeys: (keyof EnvSettings)[] = ["siaIndexerUrl", "siaAppId", "siaAppName", "siaAppDescription", "siaConnected"];
    const provKeys: (keyof EnvSettings)[] = ["googleClientId", "googleClientSecret", "githubClientId", "githubClientSecret", "webauthnRpId", "webauthnOrigin"];

    if (siaKeys.includes(key)) setSiaDirty(true);
    if (provKeys.includes(key)) setProvDirty(true);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center py-20 font-mono text-sm" style={{ color: "var(--subtle)" }}>
          <span className="animate-pulse">▋</span> Loading environment…
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center py-20 font-mono text-sm" style={{ color: "var(--red)" }}>
          Failed to load environment settings.
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
          <div className="section-label mb-2">Admin</div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--text)" }}>
            <Shield className="w-6 h-6" style={{ color: "var(--green)" }} />
            Environment Settings
          </h1>
          <p className="text-xs mt-1.5" style={{ color: "var(--subtle)" }}>
            View and update the environment configuration that was set up during the initial setup wizard.
            Changes here take effect immediately.
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
        </div>
      </div>

      {/* Settings cards */}
      <div className="space-y-6">

        {/* ── Sia Configuration ── */}
        <div
          className="bench-card rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded flex items-center justify-center"
                style={{
                  background: settings.siaConnected
                    ? "rgba(0,230,118,0.08)"
                    : "rgba(255,68,68,0.08)",
                  border: `1px solid ${settings.siaConnected ? "rgba(0,230,118,0.2)" : "rgba(255,68,68,0.2)"}`,
                }}
              >
                {settings.siaConnected ? (
                  <Wifi className="w-4.5 h-4.5" style={{ color: "var(--green)" }} />
                ) : (
                  <WifiOff className="w-4.5 h-4.5" style={{ color: "var(--red)" }} />
                )}
              </div>
              <div>
                <h3 className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                  Sia Storage
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                  {settings.siaConnected
                    ? "Sia is connected and operational."
                    : "Sia is not connected — storage operations will be unavailable."}
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                  SIA_INDEXER_URL
                </label>
                <input
                  type="text"
                  value={settings.siaIndexerUrl}
                  onChange={(e) => updateField("siaIndexerUrl", e.target.value)}
                  placeholder="https://sia.storage"
                  className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>

              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                  SIA_APP_ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.siaAppId}
                    onChange={(e) => updateField("siaAppId", e.target.value)}
                    placeholder="64-character hex app ID"
                    className="flex-1 px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const hex = Array.from({ length: 32 }, () =>
                        Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
                      ).join("");
                      updateField("siaAppId", hex);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg font-mono text-xs font-semibold whitespace-nowrap transition-all"
                    style={{
                      background: "rgba(0,230,118,0.1)",
                      color: "var(--green)",
                      border: "1px solid rgba(0,230,118,0.25)",
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                  SIA_APP_NAME
                </label>
                <input
                  type="text"
                  value={settings.siaAppName}
                  onChange={(e) => updateField("siaAppName", e.target.value)}
                  placeholder="OpenBench"
                  className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>

              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                  SIA_APP_DESCRIPTION
                </label>
                <input
                  type="text"
                  value={settings.siaAppDescription}
                  onChange={(e) => updateField("siaAppDescription", e.target.value)}
                  placeholder="OpenBench - Decentralized AI Benchmarking"
                  className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                />
              </div>
            </div>

            {/* ── Recovery phrase & re-registration (same flow as setup wizard) ── */}
            <div
              className="p-4 rounded-lg"
              style={{
                background: "rgba(0,230,118,0.03)",
                border: "1px solid rgba(0,230,118,0.12)",
              }}
            >
              <p className="font-mono text-xs mb-3" style={{ color: "var(--subtle)" }}>
                To re-authenticate with the Sia indexer (e.g. after changing the app ID), enter your
                BIP-39 recovery phrase below and start the registration flow.
              </p>

              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                  BIP-39 Recovery Phrase
                </label>
                <textarea
                  value={siaRecoveryPhrase}
                  onChange={(e) => setSiaRecoveryPhrase(e.target.value)}
                  placeholder="Enter your 12 or 24-word BIP-39 recovery phrase..."
                  rows={3}
                  disabled={siaLoading}
                  className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none resize-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    opacity: siaLoading ? 0.5 : 1,
                  }}
                />
                <p className="font-mono text-[10px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
                  Your recovery phrase is your master key. It is used only once to derive the App Key
                  and is <strong className="text-[var(--red)]">never stored</strong> by the application.
                </p>
              </div>
            </div>

            {siaError && (
              <div
                className="px-4 py-3 rounded-lg font-mono text-xs"
                style={{
                  background: "rgba(255,68,68,0.08)",
                  border: "1px solid rgba(255,68,68,0.25)",
                  color: "var(--red)",
                }}
              >
                {siaError}
              </div>
            )}

            {approvalUrl && (
              <div
                className="px-4 py-4 rounded-lg space-y-3"
                style={{
                  background: "rgba(0,230,118,0.06)",
                  border: "1px solid rgba(0,230,118,0.2)",
                }}
              >
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4" style={{ color: "var(--green)" }} />
                  <span className="font-mono text-xs font-semibold" style={{ color: "var(--green)" }}>
                    Configuration saved — approval required
                  </span>
                </div>
                <p className="font-mono text-xs leading-relaxed" style={{ color: "var(--subtle)" }}>
                  Open the URL below to authorize the app on the Sia indexer, then come back
                  and click <strong>"I've approved it"</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <a
                    href={approvalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-mono"
                    style={{
                      background: "var(--blue)",
                      color: "#fff",
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open approval URL
                  </a>
                  <button
                    onClick={handleCheckApproval}
                    disabled={checkingApproval}
                    className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-mono font-semibold transition-all disabled:opacity-40"
                    style={{
                      background: "rgba(0,230,118,0.1)",
                      color: "var(--green)",
                      border: "1px solid rgba(0,230,118,0.25)",
                    }}
                  >
                    {checkingApproval ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    {checkingApproval ? "Checking…" : "I've approved it"}
                  </button>
                </div>
              </div>
            )}

            {!approvalUrl && (siaDirty || siaRecoveryPhrase.trim()) && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleSiaReRegister}
                  disabled={!siaRecoveryPhrase.trim() || siaLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all disabled:opacity-40"
                  style={{
                    background: "rgba(0,230,118,0.1)",
                    color: "var(--green)",
                    border: "1px solid rgba(0,230,118,0.25)",
                  }}
                >
                  {siaLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-3.5 h-3.5" />
                  )}
                  {siaLoading ? "Registering…" : "Re-register with Sia"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── OpenRouter Configuration ── */}
        <div
          className="bench-card rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded flex items-center justify-center"
                style={{
                  background: settings.hasOpenrouterKey
                    ? "rgba(0,230,118,0.08)"
                    : "rgba(140,148,168,0.08)",
                  border: `1px solid ${settings.hasOpenrouterKey ? "rgba(0,230,118,0.2)" : "rgba(140,148,168,0.2)"}`,
                }}
              >
                <KeyRound className="w-4.5 h-4.5" style={{
                  color: settings.hasOpenrouterKey ? "var(--green)" : "var(--subtle)",
                }} />
              </div>
              <div>
                <h3 className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                  OpenRouter API Key
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                  {settings.hasOpenrouterKey
                    ? "An API key is currently set. You can update it below."
                    : "No API key set — LLM calls will fail."}
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                {settings.hasOpenrouterKey ? "New API Key (leave blank to keep current)" : "API Key"}
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showSecrets.openrouter ? "text" : "password"}
                    value={openrouterKey}
                    onChange={(e) => {
                      setOpenrouterKey(e.target.value);
                      setOrDirty(true);
                    }}
                    placeholder="sk-or-v1-..."
                    className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none pr-10"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => toggleSecret("openrouter")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                    style={{ color: "var(--subtle)" }}
                  >
                    {showSecrets.openrouter ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="font-mono text-[10px] mt-1" style={{ color: "var(--muted)" }}>
                Get a key at{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>
                  openrouter.ai/keys
                </a>
              </p>
            </div>

            {settings.hasOpenrouterKey && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{
                  background: "rgba(0,230,118,0.06)",
                  border: "1px solid rgba(0,230,118,0.2)",
                }}
              >
                <Check className="w-3.5 h-3.5" style={{ color: "var(--green)" }} />
                <span className="font-mono text-xs" style={{ color: "var(--green)" }}>
                  Key is configured
                </span>
              </div>
            )}

            {(orDirty) && (
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={handleOpenRouterSave}
                  disabled={!openrouterKey.trim() || orSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all disabled:opacity-40"
                  style={{
                    background: "rgba(0,230,118,0.1)",
                    color: "var(--green)",
                    border: "1px solid rgba(0,230,118,0.25)",
                  }}
                >
                  {orSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="w-3.5 h-3.5" />
                  )}
                  {orSaving ? "Saving…" : "Save key"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Social Providers Configuration ── */}
        <div
          className="bench-card rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded flex items-center justify-center"
                style={{
                  background: "rgba(59,130,246,0.08)",
                  border: "1px solid rgba(59,130,246,0.2)",
                }}
              >
                <Globe className="w-4.5 h-4.5" style={{ color: "var(--blue)" }} />
              </div>
              <div>
                <h3 className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                  Social Login Providers
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                  OAuth credentials for user authentication.
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 space-y-6">
            {/* Google */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4" style={{ color: "var(--subtle)" }} />
                <span className="font-mono text-xs font-semibold" style={{ color: "var(--text)" }}>
                  Google OAuth
                </span>
              </div>
              <div
                className="px-3 py-2 rounded-lg mb-3 font-mono text-[10px]"
                style={{
                  background: "rgba(59,130,246,0.08)",
                  border: "1px solid rgba(59,130,246,0.2)",
                  color: "var(--blue)",
                }}
              >
                Callback URL:{" "}
                <strong className="select-all">
                  {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/auth/callback/google
                </strong>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={settings.googleClientId}
                    onChange={(e) => updateField("googleClientId", e.target.value)}
                    placeholder="xxx.apps.googleusercontent.com"
                    className="w-full px-3 py-2 rounded-lg font-mono text-xs outline-none"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                    Client Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showSecrets.googleSecret ? "text" : "password"}
                      value={settings.googleClientSecret}
                      onChange={(e) => updateField("googleClientSecret", e.target.value)}
                      placeholder="GOCSX-..."
                      className="w-full px-3 py-2 rounded-lg font-mono text-xs outline-none pr-10"
                      style={{
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret("googleSecret")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                      style={{ color: "var(--subtle)" }}
                    >
                      {showSecrets.googleSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* GitHub */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Github className="w-4 h-4" style={{ color: "var(--subtle)" }} />
                <span className="font-mono text-xs font-semibold" style={{ color: "var(--text)" }}>
                  GitHub OAuth
                </span>
              </div>
              <div
                className="px-3 py-2 rounded-lg mb-3 font-mono text-[10px]"
                style={{
                  background: "rgba(59,130,246,0.08)",
                  border: "1px solid rgba(59,130,246,0.2)",
                  color: "var(--blue)",
                }}
              >
                Callback URL:{" "}
                <strong className="select-all">
                  {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/auth/callback/github
                </strong>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={settings.githubClientId}
                    onChange={(e) => updateField("githubClientId", e.target.value)}
                    placeholder="Ov23..."
                    className="w-full px-3 py-2 rounded-lg font-mono text-xs outline-none"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                    Client Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showSecrets.githubSecret ? "text" : "password"}
                      value={settings.githubClientSecret}
                      onChange={(e) => updateField("githubClientSecret", e.target.value)}
                      placeholder="cf14..."
                      className="w-full px-3 py-2 rounded-lg font-mono text-xs outline-none pr-10"
                      style={{
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecret("githubSecret")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                      style={{ color: "var(--subtle)" }}
                    >
                      {showSecrets.githubSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {provDirty && (
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={handleProvidersSave}
                disabled={provSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono transition-all disabled:opacity-40"
                style={{
                  background: "rgba(0,230,118,0.1)",
                  color: "var(--green)",
                  border: "1px solid rgba(0,230,118,0.25)",
                }}
              >
                {provSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                {provSaving ? "Saving…" : "Save providers"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}