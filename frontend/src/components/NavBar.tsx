"use client";

// src/components/NavBar.tsx
//
// Session-aware NavBar with Sia connection status.
//
// Role visibility:
//   user        → Dashboard, Projects
//   admin       → + Admin
//   super_admin → + Admin, Models

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import {
  Activity,
  LogOut,
  ChevronDown,
  User,
  Shield,
  Settings2,
  FolderOpen,
  LayoutDashboard,
  Wifi,
  WifiOff,
} from "lucide-react";

// ─── Sia status ───────────────────────────────────────────────────────────────

interface SiaConnectionStatus {
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
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-xs"
        style={{ color: "var(--subtle)", borderColor: "var(--border)", background: "transparent" }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "var(--subtle)" }}
        />
        Checking…
      </span>
    );
  }

  if (sia.connected) {
    return (
      <span
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-xs"
        style={{
          color: "var(--green)",
          borderColor: "rgba(0,230,118,0.25)",
          background: "rgba(0,230,118,0.06)",
        }}
      >
        <Wifi className="w-3 h-3" />
        Sia live
      </span>
    );
  }

  if (sia.mode === "demo") {
    return (
      <span
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-xs"
        style={{
          color: "var(--amber)",
          borderColor: "rgba(255,179,0,0.25)",
          background: "rgba(255,179,0,0.06)",
        }}
      >
        <WifiOff className="w-3 h-3" />
        Demo mode
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-xs"
      style={{
        color: "var(--red)",
        borderColor: "rgba(255,68,68,0.25)",
        background: "rgba(255,68,68,0.06)",
      }}
    >
      <WifiOff className="w-3 h-3" />
      {sia.reason ? `Offline` : "Offline"}
    </span>
  );
}

// ─── Nav link ─────────────────────────────────────────────────────────────────

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  accent = "green",
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  accent?: "green" | "amber";
}) {
  const activeColor = accent === "amber" ? "var(--amber)" : "var(--green)";
  const activeBg =
    accent === "amber" ? "rgba(255,179,0,0.08)" : "rgba(0,230,118,0.08)";
  const activeBorder =
    accent === "amber" ? "rgba(255,179,0,0.2)" : "rgba(0,230,118,0.2)";

  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all"
      style={{
        color: isActive ? activeColor : "var(--subtle)",
        background: isActive ? activeBg : "transparent",
        border: isActive
          ? `1px solid ${activeBorder}`
          : "1px solid transparent",
      }}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </Link>
  );
}

// ─── NavBar ───────────────────────────────────────────────────────────────────

export function NavBar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [sia, setSia] = useState<SiaConnectionStatus | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "super_admin";
  const isSuperAdmin = role === "super_admin";

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  // Close dropdown on outside click
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
        className="sticky top-0 z-50 flex items-center justify-between px-6 h-14"
        style={{
          background: "rgba(10,11,13,0.92)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{ background: "var(--green)", boxShadow: "0 0 12px rgba(0,230,118,0.4)" }}
          >
            <Activity className="w-4 h-4" style={{ color: "#0a0b0d" }} />
          </div>
          <span className="font-mono font-bold text-sm" style={{ color: "var(--text)" }}>
            OPEN<span style={{ color: "var(--green)" }}>BENCH</span>
          </span>
        </div>
      </header>
    );
  }

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6 h-14"
      style={{
        background: "rgba(10,11,13,0.92)",
        borderBottom: "1px solid var(--border)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* ── Left: logo + nav links ── */}
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{ background: "var(--green)", boxShadow: "0 0 12px rgba(0,230,118,0.4)" }}
          >
            <Activity className="w-4 h-4" style={{ color: "#0a0b0d" }} />
          </div>
          <span className="font-mono font-bold text-sm" style={{ color: "var(--text)" }}>
            OPEN<span style={{ color: "var(--green)" }}>BENCH</span>
          </span>
        </Link>

        {session?.user && (
          <nav className="flex items-center gap-1">
            <NavLink
              href="/dashboard"
              label="Dashboard"
              icon={LayoutDashboard}
              isActive={isActive("/dashboard")}
            />
            {isAdmin && (
              <>
                <NavLink
                  href="/projects"
                  label="Projects"
                  icon={FolderOpen}
                  isActive={isActive("/projects")}
                />
                <NavLink
                  href="/admin"
                  label="Admin"
                  icon={Shield}
                  isActive={isActive("/admin")}
                  accent="amber"
                />
              </>
            )}
            {isSuperAdmin && (
              <NavLink
                href="/admin/models"
                label="Models"
                icon={Settings2}
                isActive={isActive("/admin/models")}
                accent="amber"
              />
            )}
          </nav>
        )}
      </div>

      {/* ── Right: Sia status + user menu ── */}
      <div className="flex items-center gap-3">
        {/* Sia indicator — only shown when logged in */}
        {session?.user && <SiaIndicator sia={sia} />}

        {session?.user ? (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-xs transition-all"
              style={{
                background: menuOpen ? "var(--surface)" : "transparent",
                border: `1px solid ${menuOpen ? "var(--border)" : "transparent"}`,
                color: "var(--text)",
              }}
            >
              {session.user.image && !avatarError ? (
                <img
                  src={session.user.image}
                  alt={session.user.name ?? "avatar"}
                  className="w-5 h-5 rounded-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <User className="w-4 h-4" style={{ color: "var(--subtle)" }} />
              )}
              <span className="max-w-[120px] truncate">
                {session.user.name ?? session.user.email}
              </span>
              {isSuperAdmin && (
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider"
                  style={{ background: "rgba(0,230,118,0.1)", color: "var(--green)" }}
                >
                  super
                </span>
              )}
              {role === "admin" && (
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider"
                  style={{ background: "rgba(255,179,0,0.1)", color: "var(--amber)" }}
                >
                  admin
                </span>
              )}
              <ChevronDown
                className="w-3 h-3 transition-transform"
                style={{
                  color: "var(--subtle)",
                  transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-52 rounded-lg overflow-hidden"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  zIndex: 100,
                }}
              >
                {/* User info */}
                <div
                  className="px-4 py-3"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <div
                    className="font-mono text-xs font-medium truncate"
                    style={{ color: "var(--text)" }}
                  >
                    {session.user.name}
                  </div>
                  <div
                    className="font-mono text-[10px] truncate mt-0.5"
                    style={{ color: "var(--subtle)" }}
                  >
                    {session.user.email}
                  </div>
                </div>

                {/* Sia status in dropdown for full detail */}
                {sia && (
                  <div
                    className="px-4 py-2.5 flex items-center gap-2 font-mono text-xs"
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
                      <Wifi className="w-3.5 h-3.5 flex-shrink-0" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
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
                  <Link
                    href="/admin/models"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 font-mono text-xs transition-colors"
                    style={{ color: "var(--subtle)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Model settings
                  </Link>
                )}

                {/* Passkeys */}
                <Link
                  href="/settings/passkeys"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 font-mono text-xs transition-colors"
                  style={{ color: "var(--subtle)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                >
                  <User className="w-3.5 h-3.5" />
                  Passkeys
                </Link>

                {/* Sign out */}
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 font-mono text-xs transition-colors text-left"
                    style={{ color: "var(--subtle)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="px-3 py-1.5 rounded-lg font-mono text-xs transition-all"
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
    </header>
  );
}