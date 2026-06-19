"use client";

// src/components/ProjectCard.tsx
//
// Shared project row used on /dashboard and /projects.
// Pass isAdmin=true to show the edit + delete action buttons.

import Link from "next/link";
import { FolderOpen, ChevronRight, Pencil, Trash2, Tag, Code } from "lucide-react";

export interface ProjectSummary {
    id: string;
    name: string;
    description: string;
    domain: string;
    projectType?: string;
    rules?: string;
    tags?: string[];
    createdAt: string;
    _count: {
        tasks: number;
        approvedTasks: number;
        pendingTasks: number;
        rejectedTasks: number;
    };
}

interface ProjectCardProps {
    project: ProjectSummary;
    isAdmin?: boolean;
    onEdit?: (project: ProjectSummary) => void;
    onDelete?: (project: ProjectSummary) => void;
}

export function ProjectCard({
    project: p,
    isAdmin = false,
    onEdit,
    onDelete,
}: ProjectCardProps) {
    return (
        <div className="bench-card flex items-center justify-between px-5 py-4 rounded-lg group">
            {/* Left: icon + name + description — the whole left side is a link */}
            <Link
                href={`/projects/${p.id}`}
                className="flex items-center gap-4 min-w-0 flex-1"
            >
                <div
                    className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                        background: "rgba(0,230,118,0.08)",
                        border: "1px solid rgba(0,230,118,0.2)",
                    }}
                >
                    <FolderOpen className="w-4 h-4" style={{ color: "var(--green)" }} />
                </div>
                <div className="min-w-0">
                    <p
                        className="font-mono font-medium text-sm mb-0.5 group-hover:text-white transition-colors"
                        style={{ color: "var(--text)" }}
                    >
                        {p.name}
                    </p>
                    <p
                        className="font-mono text-xs truncate max-w-sm"
                        style={{ color: "var(--subtle)" }}
                    >
                        {p.description}
                    </p>
                </div>
            </Link>

            {/* Right: domain + task counts + (admin) actions + chevron */}
            <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0 ml-2 sm:ml-4">
                {/* Domain badge — hidden on small screens */}
                <span
                    className="font-mono text-xs px-2 py-0.5 rounded hidden sm:inline"
                    style={{
                        background: "var(--muted)",
                        color: "var(--subtle)",
                        border: "1px solid var(--border)",
                    }}
                >
                    {p.domain}
                </span>

                {/* Task counts — compact on mobile */}
                <div className="flex items-center gap-1.5 sm:gap-3 font-mono text-xs">
                    <span style={{ color: "var(--subtle)" }}>
                        {p._count.tasks}
                    </span>
                    {p._count.approvedTasks > 0 && (
                        <span className="hidden sm:inline" style={{ color: "var(--green)" }}>
                            {p._count.approvedTasks} approved
                        </span>
                    )}
                    {p._count.pendingTasks > 0 && (
                        <span className="hidden sm:inline" style={{ color: "var(--blue)" }}>
                            {p._count.pendingTasks} running
                        </span>
                    )}
                </div>

                {/* Admin actions — only rendered when isAdmin=true */}
                {isAdmin && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onEdit?.(p)}
                            title="Edit project"
                            className="p-1.5 rounded transition-all"
                            style={{ color: "var(--muted)" }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.color = "var(--blue)")
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.color = "var(--muted)")
                            }
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => onDelete?.(p)}
                            title="Delete project"
                            className="p-1.5 rounded transition-all"
                            style={{ color: "var(--muted)" }}
                            onMouseEnter={(e) =>
                                (e.currentTarget.style.color = "var(--red)")
                            }
                            onMouseLeave={(e) =>
                                (e.currentTarget.style.color = "var(--muted)")
                            }
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                <Link href={`/projects/${p.id}`}>
                    <ChevronRight className="w-4 h-4" style={{ color: "var(--muted)" }} />
                </Link>
            </div>
        </div>
    );
}