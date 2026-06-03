"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, RefreshCw, ChevronRight, FolderOpen } from "lucide-react";

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  domain: string;
  createdAt: string;
  _count: {
    tasks: number;
    approvedTasks: number;
    pendingTasks: number;
    rejectedTasks: number;
  };
}

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading,  setLoading]  = useState(true);

  const fetchProjects = useCallback(async () => {
    const data = await fetch("/api/projects").then((r) => r.json()).catch(() => []);
    setProjects(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="section-label mb-2">Control Panel</div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text)" }}>
            Projects
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProjects}
            className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <Link
            href="/projects/new"
            className="bench-btn-primary flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            New Project
          </Link>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Total Projects", value: projects.length,                                       color: "var(--text)"  },
          { label: "Total Tasks",    value: projects.reduce((s, p) => s + p._count.tasks, 0),      color: "var(--subtle)"},
          { label: "Approved",       value: projects.reduce((s, p) => s + p._count.approvedTasks, 0), color: "var(--green)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bench-card rounded-lg px-4 py-3">
            <div className="section-label mb-1">{label}</div>
            <div className="font-display font-bold text-2xl" style={{ color }}>
              {loading ? "—" : value}
            </div>
          </div>
        ))}
      </div>

      {/* Projects list */}
      {loading ? (
        <div className="text-center py-12 font-mono text-sm" style={{ color: "var(--subtle)" }}>
          Loading…
        </div>
      ) : projects.length === 0 ? (
        <div
          className="text-center py-20 border rounded-lg"
          style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
        >
          <FolderOpen className="w-8 h-8 mx-auto mb-4" style={{ color: "var(--muted)" }} />
          <p className="font-mono text-sm mb-1" style={{ color: "var(--text)" }}>
            No projects yet
          </p>
          <p className="text-xs mb-5" style={{ color: "var(--subtle)" }}>
            Create a project, then submit benchmark tasks to it.
          </p>
          <Link
            href="/projects/new"
            className="bench-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="bench-card flex items-center justify-between px-5 py-4 rounded-lg group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)" }}
                >
                  <FolderOpen className="w-4 h-4" style={{ color: "var(--green)" }} />
                </div>
                <div className="min-w-0">
                  <p
                    className="font-medium text-sm mb-0.5 group-hover:text-white transition-colors"
                    style={{ color: "var(--text)" }}
                  >
                    {p.name}
                  </p>
                  <p className="text-xs truncate max-w-sm" style={{ color: "var(--subtle)" }}>
                    {p.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                {/* Domain */}
                <span
                  className="font-mono text-xs px-2 py-0.5 rounded hidden md:inline"
                  style={{ background: "var(--muted)", color: "var(--subtle)", border: "1px solid var(--border)" }}
                >
                  {p.domain}
                </span>

                {/* Task counts */}
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span style={{ color: "var(--subtle)" }}>
                    {p._count.tasks} task{p._count.tasks !== 1 ? "s" : ""}
                  </span>
                  {p._count.approvedTasks > 0 && (
                    <span style={{ color: "var(--green)" }}>
                      {p._count.approvedTasks} approved
                    </span>
                  )}
                  {p._count.pendingTasks > 0 && (
                    <span style={{ color: "var(--blue)" }}>
                      {p._count.pendingTasks} running
                    </span>
                  )}
                </div>

                <ChevronRight className="w-4 h-4" style={{ color: "var(--muted)" }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}