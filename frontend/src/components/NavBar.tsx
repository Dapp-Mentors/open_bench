"use client";

// src/components/NavBar.tsx

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Activity,
  LogOut,
  ChevronDown,
  User,
  Settings2,
  Wifi,
  WifiOff,
  Menu,
  Globe,
} from "lucide-react";
import { SideBar } from "@/components/SideBar";

// ─── Sia status ───────────────────────────────────────────────────────────────

export interface SiaConnectionStatus {
  connected: boolean;
  mode: "live" | "demo";
  reason: string | null;
}

async function fetchSiaStatus(): Promise<SiaConnectionStatus> {
  try {
    const res = await fetch("/api/sia/status");
    if (!res.ok) return { connected: false, mode: "live", reason: `HTTP ${res.status}` };
    return await res.json();
  } catch {
    return { connected: false, mode: "live", reason: "Backend unreachable" };
  }
}

function SiaIndicator({ sia }: { sia: SiaConnectionStatus | null }) {
  if (!sia) {
    return (
      <span
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-xs font-medium"
        style={{ color: "var(--subtle)", borderColor: "var(--border)", background: "transparent" }}
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: "var(--subtle)" }}
        />
        <span className="hidden sm:inline">Checking…</span>
      </span>
    );
  }

  if (sia.connected) {
    return (
      <span
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-xs font-medium"
        style={{
          color: "var(--green)",
          borderColor: "rgba(0,230,118,0.3)",
          background: "rgba(0,230,118,0.07)",
        }}
      >
        <Wifi className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Sia live</span>
      </span>
    );
  }

  if (sia.mode === "demo") {
    return (
      <span
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-xs font-medium"
        style={{
          color: "var(--amber)",
          borderColor: "rgba(255,179,0,0.3)",
          background: "rgba(255,179,0,0.07)",
        }}
      >
        <WifiOff className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Demo mode</span>
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-xs font-medium"
      style={{
        color: "var(--red)",
        borderColor: "rgba(255,68,68,0.3)",
        background: "rgba(255,68,68,0.07)",
      }}
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Offline</span>
    </span>
  );
}

// ─── NavBar ───────────────────────────────────────────────────────────────────

export function NavBar() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [sia, setSia] = useState<SiaConnectionStatus | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset avatarError when the image URL changes
  useEffect(() => {
    setAvatarError(false);
  }, [session?.user?.image]);

  const role = session?.user?.role;
  const isSuperAdmin = role === "super_admin";

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Sia status — initial fetch + poll every 10 minutes
  useEffect(() => {
    fetchSiaStatus().then(setSia);
    intervalRef.current = setInterval(() => fetchSiaStatus().then(setSia), 600_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (status === "loading") {
    return (
      <header
        className="sticky top-0 z-50 flex items-center justify-center px-4 sm:px-7 h-16"
        style={{
          background: "rgba(10,11,13,0.95)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ background: "var(--green)", boxShadow: "0 0 16px rgba(0,230,118,0.45)" }}
            >
              <Activity className="w-4 h-4" style={{ color: "#0a0b0d" }} />
            </div>
            <span className="font-mono font-bold text-sm tracking-wide" style={{ color: "var(--text)" }}>
              OPEN<span style={{ color: "var(--green)" }}>BENCH</span>
            </span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <>
      <header
        className="sticky top-0 z-50 flex items-center justify-center px-4 sm:px-6 h-16"
        style={{
          background: "rgba(10,11,13,0.95)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center justify-between w-full">
          {/* ── Left: hamburger (mobile) + logo ── */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Hamburger — mobile only */}
            {session?.user && (
              <button
                onClick={() => setSidebarOpen((o) => !o)}
                className="lg:hidden p-2 rounded-lg transition-colors flex-shrink-0"
                style={{
                  color: sidebarOpen ? "var(--green)" : "var(--subtle)",
                  background: sidebarOpen ? "rgba(0,230,118,0.08)" : "transparent",
                  border: `1px solid ${sidebarOpen ? "rgba(0,230,118,0.2)" : "transparent"}`,
                }}
                aria-label="Toggle navigation"
                aria-expanded={sidebarOpen}
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
              <div
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ background: "var(--green)", boxShadow: "0 0 16px rgba(0,230,118,0.45)" }}
              >
                <Activity className="w-4 h-4" style={{ color: "#0a0b0d" }} />
              </div>
              <span className="font-mono font-bold text-sm tracking-wide" style={{ color: "var(--text)" }}>
                OPEN<span style={{ color: "var(--green)" }}>BENCH</span>
              </span>
            </Link>
          </div>

          {/* ── Right: Sia status + user menu ── */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Sia indicator — desktop only (sidebar shows it on mobile) */}
            {session?.user && (
              <div className="hidden sm:block">
                <SiaIndicator sia={sia} />
              </div>
            )}

            {session?.user ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3.5 py-2 rounded-lg font-mono text-[13px] font-medium transition-all"
                  style={{
                    background: menuOpen ? "var(--surface)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${menuOpen ? "var(--border)" : "rgba(255,255,255,0.07)"}`,
                    color: "var(--text)",
                  }}
                >
                  {session.user.image && !avatarError ? (
                    <img
                      ref={imageRef}
                      key={session.user.image}
                      src={session.user.image}
                      alt={session.user.name ?? "avatar"}
                      className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: "rgba(0,230,118,0.15)", color: "var(--green)" }}
                    >
                      {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="hidden sm:inline max-w-[140px] truncate">
                    {session.user.name ?? session.user.email}
                  </span>
                  {isSuperAdmin && (
                    <span
                      className="hidden sm:inline px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider"
                      style={{ background: "rgba(0,230,118,0.1)", color: "var(--green)" }}
                    >
                      super
                    </span>
                  )}
                  {role === "admin" && (
                    <span
                      className="hidden sm:inline px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider"
                      style={{ background: "rgba(255,179,0,0.1)", color: "var(--amber)" }}
                    >
                      admin
                    </span>
                  )}
                  <ChevronDown
                    className="hidden sm:block w-3.5 h-3.5 transition-transform"
                    style={{
                      color: "var(--subtle)",
                      transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </button>

                {menuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-52 sm:w-56 rounded-xl overflow-hidden"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                      zIndex: 100,
                    }}
                  >
                    {/* User info */}
                    <div
                      className="px-4 py-3.5"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <div
                        className="font-mono text-[13px] font-semibold truncate"
                        style={{ color: "var(--text)" }}
                      >
                        {session.user.name}
                      </div>
                      <div
                        className="font-mono text-[11px] truncate mt-0.5"
                        style={{ color: "var(--subtle)" }}
                      >
                        {session.user.email}
                      </div>
                    </div>

                    {/* Sia status in dropdown on mobile */}
                    {sia && (
                      <div
                        className="px-4 py-3 flex items-center gap-2.5 font-mono text-[12px] sm:hidden"
                        style={{
                          borderBottom: "1px solid var(--border)",
                          color: sia.connected
                            ? "var(--green)"
                            : sia.mode === "demo"
                              ? "var(--amber)"
                              : "var(--red)",
                        }}
                      >
                        {sia.connected ? (
                          <Wifi className="w-4 h-4 flex-shrink-0" />
                        ) : (
                          <WifiOff className="w-4 h-4 flex-shrink-0" />
                        )}
                        <span className="truncate">
                          {sia.connected
                            ? "Sia Network connected"
                            : sia.mode === "demo"
                              ? "Running in demo mode"
                              : `Sia offline — ${sia.reason ?? "unknown"}`}
                        </span>
                      </div>
                    )}

                    {/* Super admin: model settings */}
                    {isSuperAdmin && (
                      <>
                        <Link
                          href="/admin/models"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 font-mono text-[12px] transition-colors"
                          style={{ color: "var(--subtle)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                        >
                          <Settings2 className="w-4 h-4" />
                          Model settings
                        </Link>
                        <Link
                          href="/admin/misc"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 font-mono text-[12px] transition-colors"
                          style={{ color: "var(--subtle)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                        >
                          <Settings2 className="w-4 h-4" />
                          Misc settings
                        </Link>
                        <Link
                          href="/admin/environment"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 font-mono text-[12px] transition-colors"
                          style={{ color: "var(--subtle)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                        >
                          <Globe className="w-4 h-4" />
                          Environment
                        </Link>
                      </>
                    )}

                    {/* Passkeys */}
                    <Link
                      href="/settings/passkeys"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 font-mono text-[12px] transition-colors"
                      style={{ color: "var(--subtle)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                    >
                      <User className="w-4 h-4" />
                      Passkeys
                    </Link>

                    {/* Sign out */}
                    <div style={{ borderTop: "1px solid var(--border)" }}>
                      <button
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="w-full flex items-center gap-3 px-4 py-3 font-mono text-[12px] transition-colors text-left"
                        style={{ color: "var(--subtle)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg font-mono text-[13px] font-medium transition-all"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar — rendered outside header so it can use fixed positioning from top:16 */}
      <SideBar isOpen={sidebarOpen} onClose={closeSidebar} sia={sia} />
    </>
  );
}