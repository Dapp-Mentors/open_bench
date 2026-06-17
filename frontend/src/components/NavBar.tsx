"use client";

// src/components/NavBar.tsx
//
// Session-aware NavBar. Shows different nav items based on role:
//   user       → Dashboard, Projects
//   admin      → + Admin panel
//   super_admin → + Models (within admin)
// Shows user avatar + sign-out in top right.

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { LogOut, ChevronDown, User, Shield, Settings2 } from "lucide-react";

export function NavBar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "super_admin";
  const isSuperAdmin = role === "super_admin";

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

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const navLinkStyle = (href: string) => ({
    color: isActive(href) ? "var(--text)" : "var(--subtle)",
    borderBottom: isActive(href) ? "1px solid var(--text)" : "1px solid transparent",
    paddingBottom: "2px",
  });

  if (status === "loading") {
    return (
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-6 h-12"
        style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>
          OpenBench
        </span>
      </header>
    );
  }

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6 h-12"
      style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}
    >
      {/* Left: wordmark + nav links */}
      <div className="flex items-center gap-6">
        <Link href="/" className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>
          OpenBench
        </Link>

        {session?.user && (
          <nav className="flex items-center gap-5">
            <Link href="/dashboard" className="font-mono text-xs transition-colors" style={navLinkStyle("/dashboard")}>
              Dashboard
            </Link>
            <Link href="/projects" className="font-mono text-xs transition-colors" style={navLinkStyle("/projects")}>
              Projects
            </Link>
            {isAdmin && (
              <Link href="/admin" className="font-mono text-xs transition-colors" style={navLinkStyle("/admin")}>
                Admin
              </Link>
            )}
            {isSuperAdmin && (
              <Link
                href="/admin/models"
                className="font-mono text-xs flex items-center gap-1 transition-colors"
                style={navLinkStyle("/admin/models")}
              >
                <Settings2 className="w-3 h-3" />
                Models
              </Link>
            )}
          </nav>
        )}
      </div>

      {/* Right: user menu or sign-in link */}
      <div className="flex items-center gap-3">
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
              {/* Avatar or fallback icon */}
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name ?? "avatar"}
                  className="w-5 h-5 rounded-full object-cover"
                />
              ) : (
                <User className="w-4 h-4" style={{ color: "var(--subtle)" }} />
              )}
              <span className="max-w-[120px] truncate">{session.user.name ?? session.user.email}</span>
              {/* Role badge */}
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
                  style={{ background: "rgba(77,166,255,0.1)", color: "var(--blue)" }}
                >
                  admin
                </span>
              )}
              <ChevronDown
                className="w-3 h-3 transition-transform"
                style={{
                  color: "var(--subtle)",
                  transform: menuOpen ? "rotate(180deg)" : "rotate(0)",
                }}
              />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-52 rounded-lg overflow-hidden"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", zIndex: 100 }}
              >
                {/* User info */}
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="font-mono text-xs font-medium truncate" style={{ color: "var(--text)" }}>
                    {session.user.name}
                  </div>
                  <div className="font-mono text-[10px] truncate mt-0.5" style={{ color: "var(--subtle)" }}>
                    {session.user.email}
                  </div>
                </div>

                {/* Admin links (only in menu for cleaner mobile nav) */}
                {isSuperAdmin && (
                  <Link
                    href="/admin/models"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 font-mono text-xs transition-colors"
                    style={{ color: "var(--subtle)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--subtle)")}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Model settings
                  </Link>
                )}

                {/* Manage passkeys */}
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
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red, #ef4444)")}
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
