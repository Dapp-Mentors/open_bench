"use client";

// src/app/setup/page.tsx
// First-run setup wizard: Sia → OpenRouter → Social Providers → Sign Up
// Auth is the last step — the first user to sign up becomes super_admin.
//
// Persists completed steps to the DB so refreshing the page restores
// progress. Each completed step shows a checkmark and can be re-done.

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Activity,
  CheckCircle2,
  Loader2,
  ExternalLink,
  KeyRound,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Github,
  Globe,
  RefreshCw,
} from "lucide-react";

type Step = "sia" | "openrouter" | "providers" | "signup";

const STEP_ORDER: Step[] = ["sia", "openrouter", "providers", "signup"];

interface SetupStatus {
  setupComplete: boolean;
  // Sia
  siaConnected: boolean;
  siaIndexerUrl: string | null;
  siaAppId: string | null;
  siaAppName: string | null;
  siaAppDescription: string | null;
  // OpenRouter
  hasOpenrouterKey: boolean;
  // Providers
  hasGoogle: boolean;
  hasGitHub: boolean;
  hasWebauthn: boolean;
  webauthnRpId: string | null;
  webauthnOrigin: string | null;
}

export default function SetupPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("sia");

  // Guard against rapid double-clicks on submit buttons
  const submittingRef = useRef(false);

  // ── Persisted completion flags (loaded from DB on mount) ─────────────────
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [siaConfirmed, setSiaConfirmed] = useState(false);
  const [orConfirmed, setOrConfirmed] = useState(false);
  const [provConfirmed, setProvConfirmed] = useState(false);

  // Sia state
  const [siaIndexerUrl, setSiaIndexerUrl] = useState("https://sia.storage");
  const [siaAppId, setSiaAppId] = useState("");
  const [siaAppName, setSiaAppName] = useState("OpenBench");
  const [siaAppDescription, setSiaAppDescription] = useState("");
  const [siaRecoveryPhrase, setSiaRecoveryPhrase] = useState("");
  const [siaLoading, setSiaLoading] = useState(false);
  const [siaError, setSiaError] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [checkingApproval, setCheckingApproval] = useState(false);

  // OpenRouter state
  const [apiKey, setApiKey] = useState("");
  const [orLoading, setOrLoading] = useState(false);
  const [orError, setOrError] = useState<string | null>(null);

  // Social providers state
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [githubClientId, setGithubClientId] = useState("");
  const [githubClientSecret, setGithubClientSecret] = useState("");
  const [webauthnRpId, setWebauthnRpId] = useState(
    typeof window !== "undefined" ? window.location.hostname : "localhost"
  );
  const [webauthnOrigin, setWebauthnOrigin] = useState(
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"
  );
  const [provLoading, setProvLoading] = useState(false);
  const [provError, setProvError] = useState<string | null>(null);

  // Finishing state
  const [finishing, setFinishing] = useState(false);

  // ── Load persisted state from DB on mount ─────────────────────────────────
  const loadPersistedState = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/status");
      const data: SetupStatus = await res.json();

      if (data.setupComplete) {
        router.push("/dashboard");
        return;
      }

      setStatus(data);

      // Restore Sia state
      if (data.siaConnected) {
        setSiaConfirmed(true);
        if (data.siaIndexerUrl) setSiaIndexerUrl(data.siaIndexerUrl);
        if (data.siaAppId) setSiaAppId(data.siaAppId);
        if (data.siaAppName) setSiaAppName(data.siaAppName);
        if (data.siaAppDescription) setSiaAppDescription(data.siaAppDescription);
      }

      // Restore OpenRouter state
      if (data.hasOpenrouterKey) {
        setOrConfirmed(true);
      }

      // Restore providers state — also fetch details
      try {
        const provRes = await fetch("/api/setup/providers");
        const provData = await provRes.json();
        if (provData.hasGoogle || provData.hasGitHub || provData.hasWebauthn) {
          setProvConfirmed(true);
          if (provData.webauthnRpId) setWebauthnRpId(provData.webauthnRpId);
          if (provData.webauthnOrigin) setWebauthnOrigin(provData.webauthnOrigin);
        }
      } catch {
        // ignore
      }
    } catch {
      // DB may not exist yet
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadPersistedState();
  }, [loadPersistedState]);

  // When user signs in, redirect to dashboard (setup is complete)
  useEffect(() => {
    if (session?.user && status?.setupComplete) {
      router.push("/dashboard");
    }
  }, [session, status, router]);

  function goTo(s: Step) {
    setStep(s);
    setSiaError(null);
    setOrError(null);
    setProvError(null);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleSiaSubmit() {
    if (!siaIndexerUrl.trim() || !siaAppId.trim() || !siaAppName.trim()) return;
    setSiaLoading(true);
    setSiaError(null);
    setApprovalUrl(null);
    try {
      const res = await fetch("/api/setup/sia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siaIndexerUrl: siaIndexerUrl.trim(),
          siaAppId: siaAppId.trim(),
          siaAppName: siaAppName.trim(),
          siaAppDescription: siaAppDescription.trim(),
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

      // If the backend returned an approval URL, show it to the user
      if (data.approval_url) {
        setApprovalUrl(data.approval_url);
        return;
      }

      // If the backend returned already_connected with a stored key, this means
      // registration already happened. We should not silently mark as confirmed
      // during setup — the user needs to see the approval flow. Force a re-init.
      if (data.already_connected) {
        setSiaError("A stored app key was found but the approval URL could not be generated. Please reset the stored key and try again.");
        return;
      }

      // Backend returned ok but no approval_url and no already_connected —
      // this means something went wrong on the backend side.
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
        setSiaConfirmed(true);
        setApprovalUrl(null);
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

  async function handleOpenRouterSubmit() {
    if (!apiKey.trim()) return;
    setOrLoading(true);
    setOrError(null);
    try {
      const res = await fetch("/api/setup/openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setOrConfirmed(true);
    } catch (err) {
      setOrError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setOrLoading(false);
    }
  }

  async function handleProvidersSubmit() {
    if (!googleClientId.trim() && !githubClientId.trim()) return;
    setProvLoading(true);
    setProvError(null);
    try {
      const res = await fetch("/api/setup/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleClientId: googleClientId.trim() || undefined,
          googleClientSecret: googleClientSecret.trim() || undefined,
          githubClientId: githubClientId.trim() || undefined,
          githubClientSecret: githubClientSecret.trim() || undefined,
          webauthnRpId: webauthnRpId.trim() || undefined,
          webauthnOrigin: webauthnOrigin.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setProvConfirmed(true);
    } catch (err) {
      setProvError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setProvLoading(false);
    }
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      await fetch("/api/setup/status", { method: "POST" });
      router.push("/login?callbackUrl=/dashboard");
    } catch {
      router.push("/login?callbackUrl=/dashboard");
    }
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--subtle)" }} />
      </div>
    );
  }

  if (status?.setupComplete) {
    return null;
  }

  const stepIndex = STEP_ORDER.indexOf(step);

  // Determine which steps are completed (from DB-persisted state)
  const stepsState: Record<Step, boolean> = {
    sia: siaConfirmed,
    openrouter: orConfirmed,
    providers: provConfirmed,
    signup: false,
  };

  // The current step index determines what's "done" for the step indicator line
  const stepsDoneBeforeMap = STEP_ORDER.reduce((acc, s) => {
    let count = 0;
    for (const st of STEP_ORDER) {
      if (st === s) break;
      if (stepsState[st]) count++;
    }
    acc[s] = count;
    return acc;
  }, {} as Record<Step, number>);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-start justify-center pt-12 px-4 pb-12" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-lg">

        {/* Header logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div
            className="w-14 h-14 flex items-center justify-center rounded-2xl"
            style={{
              background: "var(--green)",
              boxShadow: "0 0 28px rgba(0,230,118,0.45)",
            }}
          >
            <Activity className="w-7 h-7" style={{ color: "#0a0b0d" }} />
          </div>
          <div className="text-center">
            <div
              className="font-mono font-bold text-xs tracking-[0.2em] uppercase mb-1"
              style={{ color: "var(--subtle)" }}
            >
              OPEN<span style={{ color: "var(--green)" }}>BENCH</span>
            </div>
            <p className="text-xs font-mono mt-1" style={{ color: "var(--subtle)" }}>
              Setup Wizard
            </p>
          </div>
        </div>

        {/* ── Interactive step indicators ── */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEP_ORDER.map((s, i) => {
            const isDone = stepsState[s];
            const isActive = step === s;
            return (
              <div key={s} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goTo(s)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-all cursor-pointer"
                  style={{
                    background: isDone
                      ? "var(--green)"
                      : isActive
                        ? "rgba(0,230,118,0.15)"
                        : "var(--muted)",
                    color: isDone ? "#0a0b0d" : isActive ? "var(--green)" : "var(--subtle)",
                    border: isActive ? "1px solid rgba(0,230,118,0.4)" : "1px solid transparent",
                  }}
                  title={
                    isDone
                      ? `${s} — completed (click to re-do)`
                      : isActive
                        ? `${s} — current step`
                        : s
                  }
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </button>
                {i < STEP_ORDER.length - 1 && (
                  <div
                    className="w-8 h-px"
                    style={{ background: stepsState[STEP_ORDER[i]] ? "var(--green)" : "var(--border)" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Subtitle showing what's completed */}
        <div className="text-center mb-6">
          <p className="font-mono text-[10px]" style={{ color: "var(--muted)" }}>
            {siaConfirmed && "✔ Sia connected "}
            {(siaConfirmed && orConfirmed) && "• "}
            {orConfirmed && "✔ OpenRouter key set "}
            {(orConfirmed && provConfirmed) && "• "}
            {provConfirmed && "✔ Providers configured "}
            {!siaConfirmed && !orConfirmed && !provConfirmed && "No steps completed yet"}
          </p>
        </div>

        {/* ── Sia Step ── */}
        {step === "sia" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <h1 className="font-mono text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>
                  Connect Sia Storage
                </h1>
                <p className="font-mono text-sm leading-relaxed" style={{ color: "var(--subtle)" }}>
                  {siaConfirmed
                    ? "Sia is already configured. You can update the settings below."
                    : "Enter your Sia indexer URL, app ID, and app details to enable decentralized storage for task artifacts and benchmark results."}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                  SIA_INDEXER_URL
                </label>
                <input
                  type="text"
                  value={siaIndexerUrl}
                  onChange={(e) => setSiaIndexerUrl(e.target.value)}
                  placeholder="https://sia.storage"
                  disabled={siaLoading}
                  className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    opacity: siaConfirmed && !siaLoading ? 0.6 : 1,
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
                    value={siaAppId}
                    onChange={(e) => setSiaAppId(e.target.value)}
                    placeholder="64-character hex app ID"
                    disabled={siaLoading}
                    className="flex-1 px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      opacity: siaConfirmed && !siaLoading ? 0.6 : 1,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const hex = Array.from({ length: 32 }, () =>
                        Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
                      ).join("");
                      setSiaAppId(hex);
                    }}
                    disabled={siaLoading}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg font-mono text-xs font-semibold whitespace-nowrap transition-all disabled:opacity-40"
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
                <p className="font-mono text-[10px] mt-1" style={{ color: "var(--muted)" }}>
                  Click <strong style={{ color: "var(--green)" }}>Generate</strong> to create a random 64-character hex app ID
                </p>
              </div>

              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                  SIA_APP_NAME
                </label>
                <input
                  type="text"
                  value={siaAppName}
                  onChange={(e) => setSiaAppName(e.target.value)}
                  placeholder="OpenBench"
                  disabled={siaLoading}
                  className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    opacity: siaConfirmed && !siaLoading ? 0.6 : 1,
                  }}
                />
              </div>

              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                  SIA_APP_DESCRIPTION (optional)
                </label>
                <input
                  type="text"
                  value={siaAppDescription}
                  onChange={(e) => setSiaAppDescription(e.target.value)}
                  placeholder="OpenBench - Decentralized AI Benchmarking"
                  disabled={siaLoading}
                  className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    opacity: siaConfirmed && !siaLoading ? 0.6 : 1,
                  }}
                />
              </div>

              {!siaConfirmed && (
                <div>
                  <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                    BIP-39 Recovery Phrase
                  </label>
                  <textarea
                    value={siaRecoveryPhrase}
                    onChange={(e) => setSiaRecoveryPhrase(e.target.value)}
                    placeholder="Enter your 12 or 24-word BIP-39 recovery phrase..."
                    rows={3}
                    className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none resize-none"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                  <p className="font-mono text-[10px] mt-1 leading-relaxed" style={{ color: "var(--muted)" }}>
                    Your recovery phrase is your master key. It is used only once to derive the App Key
                    and is <strong className="text-[var(--red)]">never stored</strong> by the application.
                  </p>
                </div>
              )}
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

            {approvalUrl && !siaConfirmed ? (
              <div
                className="px-4 py-4 rounded-lg space-y-3"
                style={{
                  background: "rgba(0,230,118,0.06)",
                  border: "1px solid rgba(0,230,118,0.2)",
                }}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: "var(--green)" }} />
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
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    {checkingApproval ? "Checking…" : "I've approved it"}
                  </button>
                </div>
              </div>
            ) : siaConfirmed && siaConfirmed && (
              <div
                className="px-4 py-4 rounded-lg space-y-2 flex items-center gap-2"
                style={{
                  background: "rgba(0,230,118,0.06)",
                  border: "1px solid rgba(0,230,118,0.2)",
                }}
              >
                <CheckCircle2 className="w-4 h-4" style={{ color: "var(--green)" }} />
                <span className="font-mono text-xs" style={{ color: "var(--green)" }}>
                  Sia storage configured and connected
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div />
              <div className="flex items-center gap-3">
                {siaConfirmed && (
                  <button
                    onClick={() => setSiaConfirmed(false)}
                    className="flex items-center gap-1.5 font-mono text-xs"
                    style={{ color: "var(--subtle)" }}
                  >
                    <RefreshCw className="w-3 h-3" /> Re-do
                  </button>
                )}
                {approvalUrl && !siaConfirmed ? null : (
                  siaConfirmed ? (
                    <button
                      onClick={() => goTo("openrouter")}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold"
                      style={{
                        background: "var(--green)",
                        color: "#0a0b0d",
                      }}
                    >
                      Next step <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSiaSubmit}
                      disabled={!siaIndexerUrl.trim() || !siaAppId.trim() || !siaAppName.trim() || !siaRecoveryPhrase.trim() || siaLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all disabled:opacity-40"
                      style={{
                        background: "var(--green)",
                        color: "#0a0b0d",
                      }}
                    >
                      {siaLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                      {siaLoading ? "Configuring…" : "Start Sia registration"}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── OpenRouter Step ── */}
        {step === "openrouter" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="font-mono text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>
                OpenRouter API Key
              </h1>
              <p className="font-mono text-sm leading-relaxed" style={{ color: "var(--subtle)" }}>
                {orConfirmed
                  ? "An OpenRouter API key has already been saved. You can update it below."
                  : "All LLM calls (quality checks, agent probes) route through OpenRouter. Set your API key here."}
              </p>
            </div>

            <div>
              <label className="block font-mono text-xs mb-1.5" style={{ color: "var(--subtle)" }}>
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                className="w-full px-3 py-2.5 rounded-lg font-mono text-sm outline-none"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
              <p className="font-mono text-[10px] mt-1" style={{ color: "var(--muted)" }}>
                Get a key at{" "}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style={{ color: "var(--blue)" }}>
                  openrouter.ai/keys
                </a>
              </p>
            </div>

            {orError && (
              <div
                className="px-4 py-3 rounded-lg font-mono text-xs"
                style={{
                  background: "rgba(255,68,68,0.08)",
                  border: "1px solid rgba(255,68,68,0.25)",
                  color: "var(--red)",
                }}
              >
                {orError}
              </div>
            )}

            {orConfirmed && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-lg"
                style={{
                  background: "rgba(0,230,118,0.06)",
                  border: "1px solid rgba(0,230,118,0.2)",
                }}
              >
                <CheckCircle2 className="w-4 h-4" style={{ color: "var(--green)" }} />
                <span className="font-mono text-xs" style={{ color: "var(--green)" }}>
                  API key saved
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => goTo("sia")}
                className="flex items-center gap-1.5 font-mono text-xs"
                style={{ color: "var(--subtle)" }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div className="flex items-center gap-3">
                {orConfirmed && (
                  <button
                    onClick={() => setOrConfirmed(false)}
                    className="flex items-center gap-1.5 font-mono text-xs"
                    style={{ color: "var(--subtle)" }}
                  >
                    <RefreshCw className="w-3 h-3" /> Re-do
                  </button>
                )}
                {!orConfirmed ? (
                  <button
                    onClick={handleOpenRouterSubmit}
                    disabled={!apiKey.trim() || orLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all disabled:opacity-40"
                    style={{
                      background: "var(--green)",
                      color: "#0a0b0d",
                    }}
                  >
                    {orLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    {orLoading ? "Saving…" : "Save key"}
                  </button>
                ) : (
                  <button
                    onClick={() => goTo("providers")}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold"
                    style={{
                      background: "var(--green)",
                      color: "#0a0b0d",
                    }}
                  >
                    Next step <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Social Providers Step ── */}
        {step === "providers" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="font-mono text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>
                Social Login Providers
              </h1>
              <p className="font-mono text-sm leading-relaxed" style={{ color: "var(--subtle)" }}>
                {provConfirmed
                  ? "Providers have been configured. You can update them below."
                  : "Configure at least one OAuth provider so users can sign in. Get these credentials from the respective developer consoles, and set the callback URL shown below in your provider's OAuth settings."}
              </p>
            </div>

            <div className="space-y-6">
              {/* Google */}
              <div
                className="p-4 rounded-lg"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              >
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
                  Set the callback URL in Google Cloud Console to:<br />
                  <strong className="select-all">{typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/auth/callback/google</strong>
                </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block font-mono text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                          Client ID
                    </label>
                    <input
                      type="text"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
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
                        <input
                          type="password"
                          value={googleClientSecret}
                          onChange={(e) => setGoogleClientSecret(e.target.value)}
                          placeholder="GOCSX-..."
                          className="w-full px-3 py-2 rounded-lg font-mono text-xs outline-none"
                          style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* GitHub */}
                  <div
                    className="p-4 rounded-lg"
                    style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
                  >
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
                      Set the callback URL in GitHub OAuth settings to:<br />
                      <strong className="select-all">{typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/auth/callback/github</strong>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="block font-mono text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                          Client ID
                        </label>
                        <input
                          type="text"
                          value={githubClientId}
                          onChange={(e) => setGithubClientId(e.target.value)}
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
                    <input
                      type="password"
                      value={githubClientSecret}
                      onChange={(e) => setGithubClientSecret(e.target.value)}
                      placeholder="cf14..."
                      className="w-full px-3 py-2 rounded-lg font-mono text-xs outline-none"
                      style={{
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {provError && (
              <div
                className="px-4 py-3 rounded-lg font-mono text-xs"
                style={{
                  background: "rgba(255,68,68,0.08)",
                  border: "1px solid rgba(255,68,68,0.25)",
                  color: "var(--red)",
                }}
              >
                {provError}
              </div>
            )}

            {provConfirmed && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-lg"
                style={{
                  background: "rgba(0,230,118,0.06)",
                  border: "1px solid rgba(0,230,118,0.2)",
                }}
              >
                <CheckCircle2 className="w-4 h-4" style={{ color: "var(--green)" }} />
                <span className="font-mono text-xs" style={{ color: "var(--green)" }}>
                  Provider configuration saved
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={() => goTo("openrouter")}
                className="flex items-center gap-1.5 font-mono text-xs"
                style={{ color: "var(--subtle)" }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <div className="flex items-center gap-3">
                {provConfirmed && (
                  <button
                    onClick={() => setProvConfirmed(false)}
                    className="flex items-center gap-1.5 font-mono text-xs"
                    style={{ color: "var(--subtle)" }}
                  >
                    <RefreshCw className="w-3 h-3" /> Re-do
                  </button>
                )}
                {!provConfirmed ? (
                  <button
                    onClick={handleProvidersSubmit}
                    disabled={(!googleClientId.trim() && !githubClientId.trim()) || provLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold transition-all disabled:opacity-40"
                    style={{
                      background: "var(--green)",
                      color: "#0a0b0d",
                    }}
                  >
                    {provLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Globe className="w-3.5 h-3.5" />
                    )}
                    {provLoading ? "Saving…" : "Save providers"}
                  </button>
                ) : (
                  <button
                    onClick={() => goTo("signup")}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs font-semibold"
                    style={{
                      background: "var(--green)",
                      color: "#0a0b0d",
                    }}
                  >
                    Next step <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Sign Up Step ── */}
        {step === "signup" && (
          <div className="space-y-6 text-center">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-2"
              style={{
                background: "rgba(0,230,118,0.1)",
                border: "1px solid rgba(0,230,118,0.25)",
              }}
            >
              <Sparkles className="w-8 h-8" style={{ color: "var(--green)" }} />
            </div>

            <div>
              <h1 className="font-mono text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>
                You're all configured!
              </h1>
              <p className="font-mono text-sm leading-relaxed" style={{ color: "var(--subtle)" }}>
                Everything is set up. Now create your account to become the platform
                super admin. The first person to sign up gets full administrative control.
              </p>
            </div>

            <div className="space-y-2 text-left">
              {[
                { label: "Sia storage configured", done: siaConfirmed },
                { label: "OpenRouter API key saved", done: orConfirmed },
                { label: "Social login providers configured", done: provConfirmed },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4" style={{ color: "var(--green)" }} />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: "var(--muted)" }} />
                  )}
                  <span
                    className="font-mono text-xs"
                    style={{ color: item.done ? "var(--text)" : "var(--subtle)" }}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => goTo("providers")}
                className="flex items-center gap-1.5 font-mono text-xs"
                style={{ color: "var(--subtle)" }}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={handleFinish}
                disabled={finishing}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-mono text-sm font-semibold transition-all disabled:opacity-40"
                style={{
                  background: "var(--green)",
                  color: "#0a0b0d",
                }}
              >
                {finishing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4" />
                )}
                {finishing ? "Redirecting…" : "Create your account →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}