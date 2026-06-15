"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, FolderOpen, Plus, ShieldCheck, Wifi, WifiOff } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface SiaConnectionStatus {
  connected: boolean;
  mode: "live" | "demo";
  reason: string | null;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Projects", icon: FolderOpen },
  { href: "/projects/new", label: "New Project", icon: Plus },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchSiaStatus(): Promise<SiaConnectionStatus> {
  try {
    const res = await fetch("/api/sia/status");
    if (!res.ok) {
      return { connected: false, mode: "live", reason: `HTTP ${res.status}` };
    }
    return await res.json();
  } catch {
    return { connected: false, mode: "live", reason: "Backend unreachable" };
  }
}

function statusLabel(status: SiaConnectionStatus): string {
  if (status.connected) return "Sia live";
  if (status.mode === "demo") return "Demo mode";
  return `Offline (${status.reason ?? "unknown"})`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function NavBar() {
  const pathname = usePathname();
  const [sia, setSia] = useState<SiaConnectionStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Initial fetch
    fetchSiaStatus().then(setSia);

    // Poll every 10 seconds to track mode changes
    intervalRef.current = setInterval(() => {
      fetchSiaStatus().then(setSia);
    }, 10_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(10, 11, 13, 0.92)",
        borderColor: "var(--border)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{ background: "var(--green)", boxShadow: "0 0 12px rgba(0,230,118,0.4)" }}
          >
            <Activity className="w-4 h-4" style={{ color: "#0a0b0d" }} />
          </div>
          <span className="font-display font-bold text-sm tracking-tight" style={{ color: "var(--text)" }}>
            OPEN<span style={{ color: "var(--green)" }}>BENCH</span>
          </span>
        </Link>

        {/* Nav */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            // Give the Admin link a slightly different treatment to distinguish it
            const isAdmin = href === "/admin";
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
                style={{
                  color:
                    active
                      ? isAdmin ? "var(--amber)" : "var(--green)"
                      : "var(--subtle)",
                  background:
                    active
                      ? isAdmin ? "rgba(251,191,36,0.08)" : "rgba(0,230,118,0.08)"
                      : "transparent",
                  border:
                    active
                      ? isAdmin
                        ? "1px solid rgba(251,191,36,0.2)"
                        : "1px solid rgba(0,230,118,0.2)"
                      : "1px solid transparent",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Sia Connection Status */}
        <div className="flex items-center gap-2 text-xs font-mono">
          {sia ? (
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors duration-300 ${
                sia.connected
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/5"
                  : sia.mode === "demo"
                    ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
                    : "text-red-400 border-red-500/30 bg-red-500/5"
              }`}
            >
              {sia.connected ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              {statusLabel(sia)}
            </span>
          ) : (
            <span
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors duration-300"
              style={{
                color: "var(--subtle)",
                borderColor: "var(--border)",
                background: "var(--muted)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--subtle)" }} />
              Checking…
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}