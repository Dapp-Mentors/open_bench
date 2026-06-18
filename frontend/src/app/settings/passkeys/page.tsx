"use client";

// src/app/settings/passkeys/page.tsx
//
// Lets any logged-in user register and delete passkeys on their account.

import { useState, useEffect, useCallback } from "react";
import { Fingerprint, Trash2, Plus, Loader2, Smartphone } from "lucide-react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";

interface Passkey {
    id: string;
    name: string;
    deviceType: string;
    createdAt: string;
    lastUsedAt: string | null;
}

export default function PasskeysPage() {
    const { data: session, status } = useSession();
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [loading, setLoading] = useState(true);
    const [registering, setRegistering] = useState(false);
    const [newName, setNewName] = useState("");
    const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    if (status === "unauthenticated") redirect("/login");

    const showToast = (type: "success" | "error", msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchPasskeys = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/settings/passkeys");
            const data = await res.json();
            setPasskeys(Array.isArray(data) ? data : []);
        } catch {
            setPasskeys([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPasskeys(); }, [fetchPasskeys]);

    const handleRegister = async () => {
        setRegistering(true);
        try {
            const { startRegistration } = await import("@simplewebauthn/browser");

            const optRes = await fetch("/api/auth/passkey/register");
            if (!optRes.ok) throw new Error("Failed to get registration options");
            const options = await optRes.json();

            const regResponse = await startRegistration(options);

            const verifyRes = await fetch("/api/auth/passkey/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ response: regResponse, name: newName || "Passkey" }),
            });

            if (!verifyRes.ok) {
                const err = await verifyRes.json();
                throw new Error(err.error ?? "Registration failed");
            }

            showToast("success", "Passkey registered successfully");
            setNewName("");
            fetchPasskeys();
        } catch (err) {
            if (err instanceof Error && err.name === "NotAllowedError") {
                showToast("error", "Registration was cancelled.");
            } else {
                showToast("error", err instanceof Error ? err.message : "Registration failed");
            }
        } finally {
            setRegistering(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/settings/passkeys/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete passkey");
            showToast("success", "Passkey removed");
            fetchPasskeys();
        } catch {
            showToast("error", "Failed to remove passkey");
        }
    };

    return (
        <div className="max-w-2xl mx-auto px-6 py-10">
            {/* Toast */}
            {toast && (
                <div
                    className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg font-mono text-xs flex items-center gap-2"
                    style={{
                        background: toast.type === "success" ? "rgba(0,230,118,0.1)" : "rgba(239,68,68,0.1)",
                        border: `1px solid ${toast.type === "success" ? "rgba(0,230,118,0.3)" : "rgba(239,68,68,0.3)"}`,
                        color: toast.type === "success" ? "var(--green)" : "var(--red, #ef4444)",
                    }}
                >
                    {toast.msg}
                </div>
            )}

            <div className="mb-8">
                <h1 className="font-mono text-xl font-semibold mb-1" style={{ color: "var(--text)" }}>
                    Passkeys
                </h1>
                <p className="font-mono text-sm" style={{ color: "var(--subtle)" }}>
                    Sign in with your fingerprint, Face ID, or a hardware security key — no password needed.
                </p>
            </div>

            {/* Register new passkey */}
            <div
                className="bench-card rounded-lg p-5 mb-6"
                style={{ border: "1px solid var(--border)" }}
            >
                <h2 className="font-mono text-sm font-medium mb-3" style={{ color: "var(--text)" }}>
                    Add a passkey
                </h2>
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        placeholder='Give it a name, e.g. "MacBook Touch ID"'
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg font-mono text-xs"
                        style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                            outline: "none",
                        }}
                    />
                    <button
                        onClick={handleRegister}
                        disabled={registering}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-xs transition-all"
                        style={{
                            background: "rgba(0,230,118,0.08)",
                            border: "1px solid rgba(0,230,118,0.25)",
                            color: "var(--green)",
                            opacity: registering ? 0.5 : 1,
                        }}
                    >
                        {registering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {registering ? "Waiting…" : "Register"}
                    </button>
                </div>
            </div>

            {/* Existing passkeys */}
            <div className="space-y-2">
                <h2 className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: "var(--subtle)" }}>
                    Registered passkeys
                </h2>

                {loading ? (
                    <div className="text-center py-8 font-mono text-sm" style={{ color: "var(--subtle)" }}>
                        <span className="animate-pulse">▋</span> Loading…
                    </div>
                ) : passkeys.length === 0 ? (
                    <div
                        className="bench-card rounded-lg p-8 text-center"
                        style={{ border: "1px solid var(--border)" }}
                    >
                        <Fingerprint className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--subtle)" }} />
                        <p className="font-mono text-sm" style={{ color: "var(--subtle)" }}>
                            No passkeys yet. Add one above.
                        </p>
                    </div>
                ) : (
                    passkeys.map((pk) => (
                        <div
                            key={pk.id}
                            className="bench-card rounded-lg px-4 py-3 flex items-center justify-between"
                            style={{ border: "1px solid var(--border)" }}
                        >
                            <div className="flex items-center gap-3">
                                <Smartphone className="w-4 h-4 flex-shrink-0" style={{ color: "var(--subtle)" }} />
                                <div>
                                    <div className="font-mono text-sm" style={{ color: "var(--text)" }}>{pk.name}</div>
                                    <div className="font-mono text-[10px]" style={{ color: "var(--subtle)" }}>
                                        {pk.deviceType} · Added {new Date(pk.createdAt).toLocaleDateString()}
                                        {pk.lastUsedAt && ` · Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(pk.id)}
                                className="p-1.5 rounded transition-colors"
                                style={{ color: "var(--subtle)" }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red, #ef4444)")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                                title="Remove passkey"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}