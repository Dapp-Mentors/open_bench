"use client";

// src/app/unauthorized/page.tsx

import { useRouter } from "next/navigation";
import { ShieldOff } from "lucide-react";

export default function UnauthorizedPage() {
    const router = useRouter();

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4"
            style={{ background: "var(--bg)" }}
        >
            <div className="text-center max-w-sm">
                <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-5"
                    style={{
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.2)",
                    }}
                >
                    <ShieldOff className="w-6 h-6" style={{ color: "var(--red, #ef4444)" }} />
                </div>

                <h1 className="font-mono text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>
                    Access denied
                </h1>
                <p className="font-mono text-sm mb-8" style={{ color: "var(--subtle)" }}>
                    You don't have permission to view this page.
                    If you think this is a mistake, ask a super admin to update your role.
                </p>

                <div className="flex gap-3 justify-center">
                    <button
                        onClick={() => router.back()}
                        className="px-4 py-2 rounded-lg font-mono text-sm transition-all"
                        style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--subtle)",
                        }}
                    >
                        Go back
                    </button>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="px-4 py-2 rounded-lg font-mono text-sm transition-all"
                        style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            color: "var(--text)",
                        }}
                    >
                        Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}