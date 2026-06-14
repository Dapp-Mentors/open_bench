"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Upload } from "lucide-react";
import { TaskRow, PIPELINE_DEF } from "@/components/TaskRow";
import type { ProjectTask } from "@/components/TaskRow";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  description: string;
  domain: string;
  createdAt: string;
  tasks: ProjectTask[];
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) {
      setProject(await res.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // Poll while any task is active
  useEffect(() => {
    if (!project) return;
    const hasActive = project.tasks.some(
      (t) => t.status === "pending" || t.status === "pipeline_running"
    );
    if (!hasActive) return;
    const timer = setInterval(fetchProject, 2500);
    return () => clearInterval(timer);
  }, [project, fetchProject]);

  function handleTaskDeleted(taskId: string) {
    setProject((prev) => prev ? {
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== taskId),
    } : prev);
  }

  const approvedCount = project?.tasks.filter((t) => t.status === "approved").length ?? 0;
  const pendingCount = project?.tasks.filter(
    (t) => t.status === "pending" || t.status === "pipeline_running"
  ).length ?? 0;
  const rejectedCount = project?.tasks.filter((t) => t.status === "rejected").length ?? 0;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 font-mono text-sm" style={{ color: "var(--subtle)" }}>
        <span className="animate-pulse">▋</span> Loading…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10 font-mono text-sm" style={{ color: "var(--red)" }}>
        Project not found.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Back */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-mono mb-6 transition-colors"
        style={{ color: "var(--subtle)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All Projects
      </Link>

      {/* Project header */}
      <div className="flex items-start justify-between mb-2 gap-4">
        <div>
          <div className="section-label mb-2">Project</div>
          <h1 className="font-display text-2xl font-bold mb-1" style={{ color: "var(--text)" }}>
            {project.name}
          </h1>
          <p className="text-sm" style={{ color: "var(--subtle)", maxWidth: "520px", lineHeight: 1.6 }}>
            {project.description}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link
            href={`/projects/${project.id}/submit`}
            className="bench-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded text-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            Add Task
          </Link>
        </div>
      </div>

      {/* Domain tag */}
      <div className="mb-6">
        <span
          className="font-mono text-xs px-2 py-1 rounded"
          style={{ background: "var(--muted)", color: "var(--subtle)", border: "1px solid var(--border)" }}
        >
          {project.domain}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: "Total Tasks", value: project.tasks.length, color: "var(--text)" },
          { label: "Approved", value: approvedCount, color: "var(--green)" },
          { label: "In Pipeline", value: pendingCount, color: "var(--blue)" },
          { label: "Rejected", value: rejectedCount, color: "var(--red)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bench-card rounded-lg px-4 py-3">
            <div className="section-label mb-1">{label}</div>
            <div className="font-display font-bold text-2xl" style={{ color }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Tasks */}
      <div className="section-label mb-3">Tasks</div>
      {project.tasks.length === 0 ? (
        <div
          className="text-center py-16 border rounded-lg"
          style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
        >
          <p className="font-mono text-sm mb-3" style={{ color: "var(--subtle)" }}>
            No tasks yet. Submit a .zip built to the Harbor spec.
          </p>
          <Link
            href={`/projects/${project.id}/submit`}
            className="bench-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Submit first task
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {project.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              projectId={project.id}
              onDeleted={handleTaskDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}