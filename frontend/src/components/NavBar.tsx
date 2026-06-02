"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Send, Play, LayoutDashboard } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { href: "/tasks/submit", label: "Submit Task",  icon: Send },
  { href: "/run/new",      label: "Run Benchmark",icon: Play },
];

export function NavBar() {
  const pathname = usePathname();

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
        <Link href="/" className="flex items-center gap-2.5 group">
          <div
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{
              background: "var(--green)",
              boxShadow: "0 0 12px rgba(0,230,118,0.4)",
            }}
          >
            <Activity className="w-4 h-4" style={{ color: "#0a0b0d" }} />
          </div>
          <span
            className="font-display font-bold text-sm tracking-tight"
            style={{ color: "var(--text)" }}
          >
            OPEN<span style={{ color: "var(--green)" }}>BENCH</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all duration-150"
                style={{
                  color: active ? "var(--green)" : "var(--subtle)",
                  background: active ? "rgba(0,230,118,0.08)" : "transparent",
                  border: active ? "1px solid rgba(0,230,118,0.2)" : "1px solid transparent",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "var(--subtle)" }}>
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "var(--green)" }}
          />
          <span>LOCAL</span>
        </div>
      </div>
    </nav>
  );
}
