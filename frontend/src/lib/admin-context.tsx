"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Task } from "@/lib/types";
import type { BenchmarkStats } from "@/components/admin/BenchmarkCards";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdminTab = "all" | "awaiting_review" | "approved" | "rejected";

interface AdminState {
  /** All tasks visible in the admin panel */
  tasks: Task[];
  /** Platform benchmark stats */
  stats: BenchmarkStats | null;
  /** Whether data is being fetched */
  loading: boolean;
  /** Currently active tab */
  activeTab: AdminTab;
  /** Task ID currently being acted upon (approve/reject) */
  acting: string | null;
  /** Expanded task ID */
  expanded: string | null;
}

interface AdminActions {
  /** Switch active tab and re-fetch if needed */
  setActiveTab: (tab: AdminTab) => void;
  /** Toggle task expansion */
  setExpanded: (id: string | null) => void;
  /** Refetch all data */
  refresh: () => Promise<void>;
  /** Approve a task — removes from visible list optimistically */
  approveTask: (task: Task) => Promise<void>;
  /** Reject a task — removes from visible list optimistically */
  rejectTask: (task: Task) => Promise<void>;
}

type AdminContextValue = AdminState & AdminActions;

// ─── Context ─────────────────────────────────────────────────────────────────

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AdminProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<BenchmarkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("awaiting_review");
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  /**
   * Build query string from active tab.
   *  - "awaiting_review" → status=pipeline_passed (legacy ready-tasks)
   *  - "all"             → no filter
   *  - "approved"        → status=approved
   *  - "rejected"        → status=rejected
   */
  const tabToStatusParam = useCallback((tab: AdminTab): string => {
    switch (tab) {
      case "awaiting_review": return "pipeline_passed";
      case "approved":        return "approved";
      case "rejected":        return "rejected";
      case "all":             return "";
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const statusParam = tabToStatusParam(activeTab);
      const query = statusParam ? `?status=${statusParam}` : "";

      const [tasksData, statsData] = await Promise.all([
        fetch(`/api/admin/ready-tasks${query}`).then((r) => r.json()),
        fetch("/api/admin/stats").then((r) => r.json()),
      ]);

      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setStats(statsData ?? null);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, tabToStatusParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const refresh = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const approveTask = useCallback(async (task: Task) => {
    setActing(task.id);
    try {
      const res = await fetch(
        `/api/projects/${task.projectId}/tasks/${task.id}/approve`,
        { method: "POST" }
      );
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        if (expanded === task.id) setExpanded(null);
        // Also refetch stats to keep counts accurate
        fetch("/api/admin/stats")
          .then((r) => r.json())
          .then((d) => setStats(d ?? null))
          .catch(() => {});
      }
    } finally {
      setActing(null);
    }
  }, [expanded]);

  const rejectTask = useCallback(async (task: Task) => {
    setActing(task.id);
    try {
      const res = await fetch(
        `/api/projects/${task.projectId}/tasks/${task.id}/reject`,
        { method: "POST" }
      );
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== task.id));
        if (expanded === task.id) setExpanded(null);
        // Also refetch stats to keep counts accurate
        fetch("/api/admin/stats")
          .then((r) => r.json())
          .then((d) => setStats(d ?? null))
          .catch(() => {});
      }
    } finally {
      setActing(null);
    }
  }, [expanded]);

  // Handle tab switch — collapse expanded task
  const handleSetActiveTab = useCallback((tab: AdminTab) => {
    setExpanded(null);
    setActiveTab(tab);
  }, []);

  return (
    <AdminContext.Provider
      value={{
        tasks,
        stats,
        loading,
        activeTab,
        acting,
        expanded,
        setActiveTab: handleSetActiveTab,
        setExpanded,
        refresh,
        approveTask,
        rejectTask,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}