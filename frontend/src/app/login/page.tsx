"use client";

// src/app/login/page.tsx
//
// Login page — matches OpenBench's dark terminal aesthetic.
// Supports: Google OAuth, GitHub OAuth, Passkey/fingerprint.

import { useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Loader2, Fingerprint, Chrome } from "lucide-react";

// GitHub icon (lucide doesn't have one that matches)
function GitHubIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .319.216.694.825.576C20.565 21.796 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
        </svg>
    );
}

type AuthMethod = "google" | "github" | "passkey";

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
    const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
    const rawError = searchParams.get("error");
    const errorMessage = rawError ? (ERROR_MESSAGES[rawError] ?? ERROR_MESSAGES.Default) : null;

    const [loading, setLoading] = useState<AuthMethod | null>(null);
    const [passkeyError, setPasskeyError] = useState<string | null>(null);

    const handleOAuth = useCallback(async (provider: "google" | "github") => {
        setLoading(provider);
        await signIn(provider, { callbackUrl });
        // signIn redirects, so setLoading won't be called again — but just in case:
        setLoading(null);
    }, [callbackUrl]);

    const handlePasskey = useCallback(async () => {
        setLoading("passkey");
        setPasskeyError(null);

        try {
            // Dynamically import so this code only runs client-side
            const { startAuthentication } = await import("@simplewebauthn/browser");

            // Get a challenge from the server
            const optRes = await fetch("/api/auth/passkey/authenticate");
            if (!optRes.ok) throw new Error("Failed to get passkey challenge");
            const options = await optRes.json();

            // Ask the browser/OS to sign the challenge
            const authResponse = await startAuthentication(options);

            // Send the signed response to the server
            const verifyRes = await fetch("/api/auth/passkey/authenticate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(authResponse),
            });

            if (!verifyRes.ok) {
                const err = await verifyRes.json();
                throw new Error(err.error ?? "Passkey authentication failed");
            }

            // Session cookie is set — redirect
            window.location.href = callbackUrl;
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                setPasskeyError("Passkey sign-in was cancelled.");
            } else {
                setPasskeyError(
                    err instanceof Error ? err.message : "Passkey authentication failed. Try again."
                );
            }
            setLoading(null);
        }
    }, [callbackUrl]);

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4"
            style={{ background: "var(--bg)" }}
        >
            <div className="w-full max-w-sm">
                {/* Wordmark */}
                <div className="text-center mb-10">
                    <div className="font-mono text-xs tracking-[0.3em] uppercase mb-3" style={{ color: "var(--subtle)" }}>
                        OpenBench
                    </div>
                    <h1 className="font-mono text-2xl font-semibold" style={{ color: "var(--text)" }}>
                        Sign in
                    </h1>
                    <p className="mt-2 text-sm font-mono" style={{ color: "var(--subtle)" }}>
                        Open infrastructure for reproducible AI benchmarks
                    </p>
                </div>

                {/* Error banner */}
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
                        onMouseEnter={(e) => {
                            if (!loading) e.currentTarget.style.borderColor = "var(--subtle)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--border)";
                        }}
                    >
                        {loading === "google" ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--subtle)" }} />
                        ) : (
                            <Chrome className="w-4 h-4" style={{ color: "#4285F4" }} />
                        )}
                        {loading === "google" ? "Signing in…" : "Continue with Google"}
                    </button>

                    {/* GitHub (replaces Discord) */}
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
                        onMouseEnter={(e) => {
                            if (!loading) e.currentTarget.style.borderColor = "var(--subtle)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--border)";
                        }}
                    >
                        {loading === "github" ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--subtle)" }} />
                        ) : (
                            <GitHubIcon className="w-4 h-4" />
                        )}
                        {loading === "github" ? "Signing in…" : "Continue with GitHub"}
                    </button>

                    {/* Divider */}
                    <div className="relative py-1">
                        <div style={{ borderTop: "1px solid var(--border)" }} />
                        <span
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 font-mono text-[10px] uppercase tracking-widest"
                            style={{ background: "var(--card-bg, var(--surface))", color: "var(--subtle)" }}
                        >
                            or
                        </span>
                    </div>

                    {/* Passkey */}
                    <button
                        onClick={handlePasskey}
                        disabled={loading !== null}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg font-mono text-sm transition-all"
                        style={{
                            background: loading === "passkey" ? "rgba(0,230,118,0.06)" : "var(--surface)",
                            border: `1px solid ${loading === "passkey" ? "rgba(0,230,118,0.3)" : "var(--border)"}`,
                            color: loading === "passkey" ? "var(--green)" : "var(--text)",
                            opacity: loading !== null && loading !== "passkey" ? 0.4 : 1,
                            cursor: loading !== null ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                            if (!loading) {
                                e.currentTarget.style.borderColor = "rgba(0,230,118,0.3)";
                                e.currentTarget.style.color = "var(--green)";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (loading !== "passkey") {
                                e.currentTarget.style.borderColor = "var(--border)";
                                e.currentTarget.style.color = "var(--text)";
                            }
                        }}
                    >
                        {loading === "passkey" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Fingerprint className="w-4 h-4" />
                        )}
                        {loading === "passkey" ? "Waiting for passkey…" : "Sign in with passkey / fingerprint"}
                    </button>
                </div>

                {/* Footer note */}
                <p className="mt-6 text-center font-mono text-[11px]" style={{ color: "var(--subtle)" }}>
                    New accounts are created automatically on first sign-in.
                    <br />
                    Contact an admin to get elevated access.
                </p>
            </div>
        </div>
    );
}