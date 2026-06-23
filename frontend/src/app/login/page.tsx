"use client";

// src/app/login/page.tsx

import { useState, useEffect, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Fingerprint, Chrome, KeyRound, Info, Github, Activity } from "lucide-react";

type AuthMethod = "google" | "github" | "passkey" | "register-passkey";

const ERROR_MESSAGES: Record<string, string> = {
    OAuthSignin: "Failed to start sign-in. Try again.",
    OAuthCallback: "Something went wrong during sign-in. Try again.",
    OAuthCreateAccount: "Could not create your account. Try again.",
    OAuthAccountNotLinked: "That email is already linked to a different sign-in method.",
    SessionRequired: "You need to sign in to access that page.",
    Default: "Something went wrong. Try again.",
};

export default function LoginPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
    const rawError = searchParams.get("error");
    const errorMessage = rawError ? (ERROR_MESSAGES[rawError] ?? ERROR_MESSAGES.Default) : null;
    const [checkingSetup, setCheckingSetup] = useState(true);

    // On mount, check if setup is complete. If not, redirect to /setup.
    useEffect(() => {
        fetch("/api/setup/status")
            .then((r) => r.json())
            .then((data) => {
                if (!data.setupComplete) {
                    router.replace("/setup");
                } else {
                    setCheckingSetup(false);
                }
            })
            .catch(() => setCheckingSetup(false));
    }, [router]);

    const [loading, setLoading] = useState<AuthMethod | null>(null);
    const [passkeyError, setPasskeyError] = useState<string | null>(null);
    const [noPasskeyRegistered, setNoPasskeyRegistered] = useState(false);

    const handleOAuth = useCallback(async (provider: "google" | "github") => {
        setLoading(provider);
        await signIn(provider, { callbackUrl });
        setLoading(null);
    }, [callbackUrl]);

    const handlePasskeySignIn = useCallback(async () => {
        setLoading("passkey");
        setPasskeyError(null);
        setNoPasskeyRegistered(false);

        try {
            const { startAuthentication } = await import("@simplewebauthn/browser");
            const optRes = await fetch("/api/auth/passkey/authenticate");
            if (!optRes.ok) throw new Error("Failed to get passkey challenge");
            const options = await optRes.json();

            const authResponse = await startAuthentication({
                ...options,
                preferImmediatelyAvailableCredentials: true,
            });

            const verifyRes = await fetch("/api/auth/passkey/authenticate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(authResponse),
            });

            if (!verifyRes.ok) {
                const err = await verifyRes.json();
                throw new Error(err.error ?? "Passkey authentication failed");
            }

            window.location.href = callbackUrl;
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setPasskeyError("Fingerprint sign-in was cancelled.");
            } else if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
                setNoPasskeyRegistered(true);
            } else {
                setPasskeyError(
                    err instanceof Error ? err.message : "Fingerprint authentication failed. Try again."
                );
            }
            setLoading(null);
        }
    }, [callbackUrl]);

    const handlePasskeyRegister = useCallback(async () => {
        setLoading("register-passkey");
        setPasskeyError(null);

        try {
            const { startRegistration } = await import("@simplewebauthn/browser");

            const optRes = await fetch("/api/auth/passkey/register-first");
            if (!optRes.ok) throw new Error("Failed to get registration options");
            const regOptions = await optRes.json();
            const tempId = regOptions._tempId;
            delete regOptions._tempId;

            const regResponse = await startRegistration(regOptions);

            const verifyRes = await fetch("/api/auth/passkey/register-first", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ response: regResponse, tempId }),
            });

            if (!verifyRes.ok) {
                const err = await verifyRes.json();
                throw new Error(err.error ?? "Fingerprint registration failed");
            }

            window.location.href = callbackUrl;
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setPasskeyError("Fingerprint registration was cancelled.");
            } else {
                setPasskeyError(
                    err instanceof Error ? err.message : "Fingerprint registration failed. Try again."
                );
            }
            setLoading(null);
        }
    }, [callbackUrl]);

    if (checkingSetup) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--subtle)" }} />
            </div>
        );
    }

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4"
            style={{ background: "var(--bg)" }}
        >
            <div className="w-full max-w-sm">

                {/* ── Header: icon → wordmark → tagline as one vertical stack ── */}
                <div className="flex flex-col items-center mb-10 gap-3">
                    {/* Icon: standalone, centered, larger */}
                    <div
                        className="w-14 h-14 flex items-center justify-center rounded-2xl"
                        style={{
                            background: "var(--green)",
                            boxShadow: "0 0 28px rgba(0,230,118,0.45)",
                        }}
                    >
                        <Activity className="w-7 h-7" style={{ color: "#0a0b0d" }} />
                    </div>

                    {/* Wordmark + heading: treated as one text block */}
                    <div className="text-center">
                        <div
                            className="font-mono font-bold text-xs tracking-[0.2em] uppercase mb-1"
                            style={{ color: "var(--subtle)" }}
                        >
                            OPEN<span style={{ color: "var(--green)" }}>BENCH</span>
                        </div>
                        <p
                            className="mt-1.5 text-xs font-mono leading-relaxed"
                            style={{ color: "var(--subtle)" }}
                        >
                            Open infrastructure for reproducible AI benchmarks
                        </p>
                    </div>
                </div>

                {/* No passkey registered — guidance callout */}
                {noPasskeyRegistered && (
                    <div
                        className="mb-6 px-4 py-4 rounded-lg font-mono text-xs space-y-2"
                        style={{
                            background: "rgba(234,179,8,0.07)",
                            border: "1px solid rgba(234,179,8,0.25)",
                            color: "var(--text)",
                        }}
                    >
                        <div className="flex items-start gap-2">
                            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "rgba(234,179,8,0.9)" }} />
                            <div className="space-y-1.5">
                                <p className="font-semibold" style={{ color: "rgba(234,179,8,0.9)" }}>
                                    No fingerprint found for this device
                                </p>
                                <p style={{ color: "var(--subtle)" }}>
                                    This account doesn't have a passkey set up yet. To use fingerprint sign-in, you'll need to add one first.
                                </p>
                                <p style={{ color: "var(--subtle)" }}>
                                    Sign in with Google or GitHub below, then go to{" "}
                                    <a
                                        href="/settings/passkeys"
                                        className="underline underline-offset-2"
                                        style={{ color: "rgba(234,179,8,0.9)" }}
                                    >
                                        Settings → Passkeys
                                    </a>{" "}
                                    to register your fingerprint.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* General error banner */}
                {(errorMessage || passkeyError) && (
                    <div
                        className="mb-6 px-4 py-3 rounded-lg font-mono text-xs"
                        style={{
                            background: "rgba(239,68,68,0.08)",
                            border: "1px solid rgba(239,68,68,0.25)",
                            color: "var(--red, #ef4444)",
                        }}
                    >
                        {errorMessage ?? passkeyError}
                    </div>
                )}

                {/* Auth card */}
                <div
                    className="bench-card rounded-xl p-6 space-y-3"
                    style={{ border: "1px solid var(--border)" }}
                >
                    {/* Fingerprint sign-in */}
                    <button
                        onClick={handlePasskeySignIn}
                        disabled={loading !== null}
                        className="w-full flex items-center justify-center gap-3 px-4 py-4 rounded-lg font-mono text-sm transition-all"
                        style={{
                            background: loading === "passkey" ? "rgba(0,230,118,0.1)" : "rgba(0,230,118,0.06)",
                            border: `1px solid ${loading === "passkey" ? "rgba(0,230,118,0.4)" : "rgba(0,230,118,0.2)"}`,
                            color: "var(--green)",
                            opacity: loading !== null && loading !== "passkey" ? 0.4 : 1,
                            cursor: loading !== null ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                            if (!loading) {
                                e.currentTarget.style.background = "rgba(0,230,118,0.1)";
                                e.currentTarget.style.borderColor = "rgba(0,230,118,0.4)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (loading !== "passkey") {
                                e.currentTarget.style.background = "rgba(0,230,118,0.06)";
                                e.currentTarget.style.borderColor = "rgba(0,230,118,0.2)";
                            }
                        }}
                    >
                        {loading === "passkey" ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Fingerprint className="w-5 h-5" />
                        )}
                        <span className="font-medium">
                            {loading === "passkey" ? "Touch your fingerprint sensor…" : "Sign in with fingerprint"}
                        </span>
                    </button>

                    {/* Register fingerprint */}
                    <button
                        onClick={handlePasskeyRegister}
                        disabled={loading !== null}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-mono text-xs transition-all"
                        style={{
                            background: loading === "register-passkey" ? "rgba(0,230,118,0.06)" : "transparent",
                            border: `1px solid ${loading === "register-passkey" ? "rgba(0,230,118,0.3)" : "transparent"}`,
                            color: loading === "register-passkey" ? "var(--green)" : "var(--subtle)",
                            opacity: loading !== null && loading !== "register-passkey" ? 0.4 : 1,
                            cursor: loading !== null ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                            if (!loading) e.currentTarget.style.color = "var(--text)";
                        }}
                        onMouseLeave={(e) => {
                            if (loading !== "register-passkey") e.currentTarget.style.color = "var(--subtle)";
                        }}
                    >
                        {loading === "register-passkey" ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <KeyRound className="w-3.5 h-3.5" />
                        )}
                        {loading === "register-passkey"
                            ? "Registering your fingerprint…"
                            : "First time? Register with fingerprint"}
                    </button>

                    {/* Divider */}
                    <div className="relative py-2">
                        <div style={{ borderTop: "1px solid var(--border)" }} />
                        <span
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 font-mono text-[10px] uppercase tracking-widest"
                            style={{ background: "var(--card-bg, var(--surface))", color: "var(--subtle)" }}
                        >
                            or continue with
                        </span>
                    </div>

                    {/* Google */}
                    <button
                        onClick={() => handleOAuth("google")}
                        disabled={loading !== null}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-mono text-sm transition-all"
                        style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            opacity: loading !== null && loading !== "google" ? 0.4 : 1,
                            cursor: loading !== null ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = "var(--subtle)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    >
                        {loading === "google" ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--subtle)" }} />
                        ) : (
                            <Chrome className="w-4 h-4" style={{ color: "#4285F4" }} />
                        )}
                        {loading === "google" ? "Signing in…" : "Google"}
                    </button>

                    {/* GitHub */}
                    <button
                        onClick={() => handleOAuth("github")}
                        disabled={loading !== null}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-mono text-sm transition-all"
                        style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            opacity: loading !== null && loading !== "github" ? 0.4 : 1,
                            cursor: loading !== null ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = "var(--subtle)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
                    >
                        {loading === "github" ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--subtle)" }} />
                        ) : (
                            <Github className="w-4 h-4" />
                        )}
                        {loading === "github" ? "Signing in…" : "GitHub"}
                    </button>
                </div>

                {/* Footer note */}
                <p className="mt-6 text-center font-mono text-[11px]" style={{ color: "var(--subtle)" }}>
                    Your fingerprint is stored securely on your device.
                    <br />
                    It is never sent to our servers.
                </p>
            </div>
        </div>
    );
}