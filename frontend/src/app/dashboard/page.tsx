"use client";

// src/app/dashboard/page.tsx

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Plus, RefreshCw, FolderOpen, Lock } from "lucide-react";
import { ProjectCard, type ProjectSummary } from "@/components/ProjectCard";

export default function Dashboard() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "admin" || role === "super_admin";

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const data = await fetch("/api/projects")
      .then((r) => r.json())
      .catch(() => []);

    const list: ProjectSummary[] = Array.isArray(data) ? data : [];
    list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    setProjects(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const totalTasks = projects.reduce((s, p) => s + p._count.tasks, 0);
  const totalApproved = projects.reduce((s, p) => s + p._count.approvedTasks, 0);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="section-label mb-2">Control Panel</div>
          <h1 className="font-mono text-2xl font-bold" style={{ color: "var(--text)" }}>
            Dashboard
          </h1>
          <p className="font-mono text-xs mt-1" style={{ color: "var(--subtle)" }}>
            {isAdmin ? "All projects on the platform" : "Projects you've been added to"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProjects}
            className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          {isAdmin && (
            <Link
              href="/projects/new"
              className="bench-btn-primary flex items-center gap-1.5 px-3 py-2 rounded text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              New Project
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Total Projects", value: projects.length, color: "var(--text)" },
          { label: "Total Tasks", value: totalTasks, color: "var(--subtle)" },
          { label: "Approved", value: totalApproved, color: "var(--green)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bench-card rounded-lg px-4 py-3">
            <div className="section-label mb-1">{label}</div>
            <div className="font-mono font-bold text-2xl" style={{ color }}>
              {loading ? "—" : value}
            </div>
          </div>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 font-mono text-sm" style={{ color: "var(--subtle)" }}>
          Loading…
        </div>
      ) : projects.length === 0 ? (
        <div
          className="text-center py-20 border rounded-lg"
          style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
        >
          {isAdmin ? (
            <>
              <FolderOpen className="w-8 h-8 mx-auto mb-4" style={{ color: "var(--muted)" }} />
              <p className="font-mono text-sm mb-1" style={{ color: "var(--text)" }}>
                No projects yet
              </p>
              <p className="text-xs mb-5" style={{ color: "var(--subtle)" }}>
                Create the first project to get started.
              </p>
              <Link
                href="/projects/new"
                className="bench-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Create first project
              </Link>
            </>
          ) : (
            <>
              <Lock className="w-8 h-8 mx-auto mb-4" style={{ color: "var(--muted)" }} />
              <p className="font-mono text-sm mb-1" style={{ color: "var(--text)" }}>
                No projects assigned
              </p>
              <p className="text-xs max-w-xs mx-auto" style={{ color: "var(--subtle)" }}>
                You haven't been added to any projects yet. Ask an admin to give you access.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            // Dashboard is read-only — no edit/delete here regardless of role.
            // Admins can manage projects from /projects.
            <ProjectCard key={p.id} project={p} isAdmin={false} />
          ))}
        </div>
      )}
    </div>
  );
}