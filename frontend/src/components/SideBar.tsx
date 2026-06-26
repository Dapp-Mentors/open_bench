"use client";

// src/components/SideBar.tsx

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
    LayoutDashboard,
    FolderOpen,
    Shield,
    Settings2,
    User,
    Wifi,
    WifiOff,
    X,
    BarChart3,
    Globe,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SiaConnectionStatus {
    connected: boolean;
    mode: "live" | "demo";
    reason: string | null;
}

interface SideBarProps {
    isOpen: boolean;
    onClose: () => void;
    sia: SiaConnectionStatus | null;
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

function SideItem({
    href,
    label,
    icon: Icon,
    isActive,
    accent = "green",
    onClick,
}: {
    href: string;
    label: string;
    icon: React.ElementType;
    isActive: boolean;
    accent?: "green" | "amber";
    onClick?: () => void;
}) {
    const activeColor = accent === "amber" ? "var(--amber)" : "var(--green)";
    const activeBg =
        accent === "amber" ? "rgba(255,179,0,0.08)" : "rgba(0,230,118,0.08)";
    const activeBorder =
        accent === "amber" ? "rgba(255,179,0,0.25)" : "rgba(0,230,118,0.25)";

    return (
        <Link
            href={href}
            onClick={onClick}
            className="sidebar-item group flex items-center gap-3 px-3 py-2.5 rounded-lg font-mono text-[12px] font-medium transition-all w-full"
            style={{
                color: isActive ? activeColor : "var(--subtle)",
                background: isActive ? activeBg : "transparent",
                border: `1px solid ${isActive ? activeBorder : "transparent"}`,
                textDecoration: "none",
            }}
            onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = "var(--subtle)";
            }}
        >
            <Icon
                className="w-4 h-4 flex-shrink-0"
                style={{ color: isActive ? activeColor : "inherit" }}
            />
            <span className="sidebar-label truncate">{label}</span>
        </Link>
    );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SideSection({ label }: { label: string }) {
    return (
        <div
            className="sidebar-label px-3 pt-4 pb-1 font-mono text-[9px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--subtle)", opacity: 0.5 }}
        >
            {label}
        </div>
    );
}

// ─── Sia status pill ──────────────────────────────────────────────────────────

function SiaSideStatus({ sia }: { sia: SiaConnectionStatus | null }) {
    if (!sia) return null;

    const color = sia.connected
        ? "var(--green)"
        : sia.mode === "demo"
            ? "var(--amber)"
            : "var(--red)";

    const borderColor = sia.connected
        ? "rgba(0,230,118,0.25)"
        : sia.mode === "demo"
            ? "rgba(255,179,0,0.25)"
            : "rgba(255,68,68,0.25)";

    const bg = sia.connected
        ? "rgba(0,230,118,0.07)"
        : sia.mode === "demo"
            ? "rgba(255,179,0,0.07)"
            : "rgba(255,68,68,0.07)";

    const StatusIcon = sia.connected ? Wifi : WifiOff;
    const statusLabel = sia.connected
        ? "Sia live"
        : sia.mode === "demo"
            ? "Demo mode"
            : "Offline";

    return (
        <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-[11px] font-medium"
            style={{ color, border: `1px solid ${borderColor}`, background: bg }}
        >
            <StatusIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="sidebar-label truncate">{statusLabel}</span>
        </div>
    );
}

// ─── SideBar ──────────────────────────────────────────────────────────────────

export function SideBar({ isOpen, onClose, sia }: SideBarProps) {
    const { data: session } = useSession();
    const pathname = usePathname();
    const drawerRef = useRef<HTMLElement>(null);

    const role = session?.user?.role;
    const isAdmin = role === "admin" || role === "super_admin";
    const isSuperAdmin = role === "super_admin";

    const isActive = (href: string) =>
        pathname === href || pathname.startsWith(href + "/");

    // Close drawer on outside click (mobile)
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                isOpen &&
                drawerRef.current &&
                !drawerRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [isOpen, onClose]);

    // Lock body scroll when mobile drawer is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    if (!session?.user) return null;

    return (
        <>
            {/* Mobile overlay */}
            <div
                className="sidebar-overlay lg:hidden fixed inset-0 z-40"
                style={{
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(4px)",
                    opacity: isOpen ? 1 : 0,
                    pointerEvents: isOpen ? "auto" : "none",
                    transition: "opacity 0.25s ease",
                }}
                aria-hidden="true"
            />

            {/* Sidebar panel */}
            <aside
                ref={drawerRef}
                className="sidebar-panel fixed left-0 top-16 z-50 flex flex-col"
                style={{
                    height: "calc(100vh - 4rem)",
                    background: "rgba(10,11,13,0.97)",
                    borderRight: "1px solid var(--border)",
                    backdropFilter: "blur(16px)",
                    // Mobile: full slide-in drawer
                    // Desktop: icon-only rail that expands on hover
                    width: "var(--sidebar-width, 200px)",
                    transform: `translateX(${isOpen ? "0" : "-100%"})`,
                    transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1), width 0.2s ease",
                    overflowX: "hidden",
                    overflowY: "auto",
                }}
                // Desktop: always visible, hover to expand
                onMouseEnter={(e) => {
                    if (window.innerWidth >= 1024) {
                        (e.currentTarget as HTMLElement).style.width = "200px";
                    }
                }}
                onMouseLeave={(e) => {
                    if (window.innerWidth >= 1024) {
                        (e.currentTarget as HTMLElement).style.width = "64px";
                    }
                }}
                aria-label="Sidebar navigation"
            >
                {/* Mobile: close button */}
                <div
                    className="lg:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
                    style={{ borderBottom: "1px solid var(--border)" }}
                >
                    <span
                        className="font-mono text-[11px] uppercase tracking-widest"
                        style={{ color: "var(--subtle)" }}
                    >
                        Navigation
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: "var(--subtle)" }}
                        onMouseEnter={(e) =>
                            (e.currentTarget.style.color = "var(--text)")
                        }
                        onMouseLeave={(e) =>
                            (e.currentTarget.style.color = "var(--subtle)")
                        }
                        aria-label="Close sidebar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Nav links */}
                <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
                    <SideSection label="Workspace" />

                    <SideItem
                        href="/dashboard"
                        label="Dashboard"
                        icon={LayoutDashboard}
                        isActive={isActive("/dashboard")}
                        onClick={() => {
                            if (window.innerWidth < 1024) onClose();
                        }}
                    />

                    {isAdmin && (
                        <SideItem
                            href="/projects"
                            label="Projects"
                            icon={FolderOpen}
                            isActive={isActive("/projects")}
                            onClick={() => {
                                if (window.innerWidth < 1024) onClose();
                            }}
                        />
                    )}

                    {isAdmin && (
                        <>
                            <SideSection label="Admin" />
                            <SideItem
                                href="/admin"
                                label="Admin Panel"
                                icon={Shield}
                                isActive={isActive("/admin") && !isActive("/admin/models") && !isActive("/admin/users")}
                                accent="amber"
                                onClick={() => {
                                    if (window.innerWidth < 1024) onClose();
                                }}
                            />
                        </>
                    )}

                    {isSuperAdmin && (
                        <>
                            <SideItem
                                href="/admin/models"
                                label="Models"
                                icon={Settings2}
                                isActive={isActive("/admin/models")}
                                accent="amber"
                                onClick={() => {
                                    if (window.innerWidth < 1024) onClose();
                                }}
                            />
                            <SideItem
                                href="/admin/benchmark-types"
                                label="Benchmark Types"
                                icon={BarChart3}
                                isActive={isActive("/admin/benchmark-types")}
                                accent="amber"
                                onClick={() => {
                                    if (window.innerWidth < 1024) onClose();
                                }}
                            />
                            <SideItem
                                href="/admin/users"
                                label="Users"
                                icon={User}
                                isActive={isActive("/admin/users")}
                                accent="amber"
                                onClick={() => {
                                    if (window.innerWidth < 1024) onClose();
                                }}
                            />
                            <SideItem
                                href="/admin/misc"
                                label="Misc Settings"
                                icon={Settings2}
                                isActive={isActive("/admin/misc")}
                                accent="amber"
                                onClick={() => {
                                    if (window.innerWidth < 1024) onClose();
                                }}
                            />
                            <SideItem
                                href="/admin/environment"
                                label="Environment"
                                icon={Globe}
                                isActive={isActive("/admin/environment")}
                                accent="amber"
                                onClick={() => {
                                    if (window.innerWidth < 1024) onClose();
                                }}
                            />
                        </>
                    )}
                </nav>

                {/* Sia status — pinned to bottom */}
                <div
                    className="px-2 py-3 flex-shrink-0"
                    style={{ borderTop: "1px solid var(--border)" }}
                >
                    <SiaSideStatus sia={sia} />
                </div>
            </aside>

            {/* Desktop: push main content right. Rendered outside the panel so it affects layout flow. */}
            <style>{`
        /* Desktop sidebar: icon-only collapsed, expands on hover */
        @media (min-width: 1024px) {
          .sidebar-panel {
            transform: translateX(0) !important;
            width: 64px !important;
          }
          .sidebar-panel:hover {
            width: 200px !important;
          }
          .sidebar-label {
            opacity: 0;
            transition: opacity 0.15s ease;
            white-space: nowrap;
          }
          .sidebar-panel:hover .sidebar-label {
            opacity: 1;
          }
          .sidebar-item {
            justify-content: flex-start;
          }
        }
        @media (max-width: 1023px) {
          .sidebar-label {
            opacity: 1;
          }
        }
      `}</style>
        </>
    );
}