"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Task } from "@/lib/types";
import type { BenchmarkStats } from "@/components/admin/BenchmarkCards";
import { useSiaSSE } from "@/lib/use-sia-sse";

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
  /** Approve a task — starts Sia upload, keeps in list until Sia is done */
  approveTask: (task: Task) => Promise<void>;
  /** Reject a task — removes from visible list optimistically */
  rejectTask: (task: Task) => Promise<void>;
  /** Revert an approved/rejected task back to pipeline_passed */
  revertTask: (task: Task) => Promise<void>;
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

  // ── SSE-driven refresh trigger ─────────────────────────────────────────
  // Increment this counter to trigger a re-fetch from the SSE hook
  const [sseRefreshKey, setSseRefreshKey] = useState(0);

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

  /**
   * Shallow-compare two arrays of tasks to avoid re-creating the array reference
   * when the data hasn't actually changed (prevents unnecessary re-renders).
   */
  const isSameTasks = (a: Task[], b: Task[]): boolean => {
    if (a.length !== b.length) return false;
    return a.every((t, i) => t.id === b[i].id && t.status === b[i].status && t.qualityScore === b[i].qualityScore);
  };

  /**
   * Shallow-compare two stats objects.
   */
  const isSameStats = (a: BenchmarkStats | null, b: BenchmarkStats | null): boolean => {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if ((a as any)[k] !== (b as any)[k]) return false;
    }
    return true;
  };

  /**
   * Fetch data — called on mount, tab change, manual refresh, and SSE events.
   */
  const fetchData = useCallback(async (isBackgroundPoll = false) => {
    if (!isBackgroundPoll) setLoading(true);
    try {
      const statusParam = tabToStatusParam(activeTab);
      const query = statusParam ? `?status=${statusParam}` : "";

      const [tasksData, statsData] = await Promise.all([
        fetch(`/api/admin/ready-tasks${query}`).then((r) => r.json()),
        fetch("/api/admin/stats").then((r) => r.json()),
      ]);

      const newTasks = Array.isArray(tasksData) ? tasksData : [];
      const newStats = statsData ?? null;

      // Only update state if data actually changed (avoids re-render storms)
      setTasks((prev) => isSameTasks(prev, newTasks) ? prev : newTasks);
      setStats((prev) => isSameStats(prev, newStats) ? prev : newStats);
    } catch {
      setTasks([]);
    } finally {
      if (!isBackgroundPoll) setLoading(false);
    }
  }, [activeTab, tabToStatusParam]);

  // Initial fetch on mount — only once
  useEffect(() => {
    fetchData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch on tab change
  useEffect(() => {
    fetchData(true);
  }, [activeTab, fetchData]);

  // Re-fetch when SSE indicates a Sia status change
  useEffect(() => {
    if (sseRefreshKey > 0) {
      fetchData(true);
    }
  }, [sseRefreshKey, fetchData]);

  // ── SSE subscription for real-time Sia updates ─────────────────────────
  useSiaSSE({
    onUpdate: useCallback((_taskId: string, siaStatus: string, _extra: Record<string, unknown>) => {
      // On "ready" or "failed", trigger a re-fetch to update both stats and task list
      if (siaStatus === "ready" || siaStatus === "failed") {
        setSseRefreshKey((k) => k + 1);
      }
    }, []),
  });

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
        // Don't remove from list! Status stays pipeline_passed until Sia completes.
        // Just refetch so the Sia badge/status updates
        await fetchData(true);
      }
    } finally {
      setActing(null);
    }
  }, [fetchData]);

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

  const revertTask = useCallback(async (task: Task) => {
    setActing(task.id);
    try {
      const res = await fetch(
        `/api/projects/${task.projectId}/tasks/${task.id}/revert`,
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
        revertTask,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}