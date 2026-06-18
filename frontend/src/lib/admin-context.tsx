"use client";

/**
 * admin-context.tsx
 *
 * Central state management for the admin task review page.
 *
 * Key design:
 *
 * 1. OPTIMISTIC UPDATES — approveTask immediately sets status="approved" so
 *    the UI reacts before the network round-trip completes.
 *
 * 2. FORCE REFRESH — fetchData accepts a `force` flag that bypasses the
 *    isSameTasks shallow-equality guard. Called with force=true after any
 *    user-initiated action so a race between the HTTP response and the DB
 *    write can't leave the UI stuck showing stale data.
 *
 * 3. BACKGROUND POLLING — a setInterval fires fetchData(true, false) every
 *    5 minutes while the component is mounted. This is the safety net: if
 *    SSE never connects (Docker networking, CORS, etc.) the UI still heals
 *    itself within one poll cycle. The interval is cleared on unmount.
 *
 * 4. SSE — the hook fires fetchData(true, true) (background + forced) on
 *    each Sia event, so when SSE is working updates are near-instant.
 *
 * 5. isSameTasks is only skipped when force=true, preserving the optimisation
 *    for the high-frequency poll path so React doesn't re-render needlessly.
 *
 * Note: Sia upload now runs as stage 9 of the pipeline (not on approval).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Task } from "@/lib/types";
import type { SiaStatus } from "@/lib/types";
import type { BenchmarkStats } from "@/components/admin/BenchmarkCards";
import { useSiaSSE } from "@/lib/use-sia-sse";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminTab = "awaiting_review" | "approved" | "rejected" | "all";

interface AdminContextValue {
  tasks: Task[];
  stats: BenchmarkStats | null;
  loading: boolean;
  activeTab: AdminTab;
  acting: string | null;       // task.id currently being actioned
  expanded: string | null;     // task.id currently expanded
  sseConnected: boolean;       // whether the SSE stream is live
  setActiveTab: (tab: AdminTab) => void;
  setExpanded: (id: string | null) => void;
  refresh: () => void;
  approveTask: (task: Task) => Promise<void>;
  rejectTask: (task: Task) => Promise<void>;
  revertTask: (task: Task) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminProvider>");
  return ctx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shallow structural equality check for the task list.
 * Only compares fields that affect visible UI so React skips unnecessary
 * re-renders on high-frequency background polls.
 * Bypassed entirely when `force=true` is passed to fetchData.
 */
function isSameTasks(a: Task[], b: Task[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (t, i) =>
      t.id === b[i].id &&
      t.status === b[i].status &&
      t.siaStatus === b[i].siaStatus &&
      t.qualityScore === b[i].qualityScore
  );
}

function isSameStats(
  a: BenchmarkStats | null,
  b: BenchmarkStats | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.totalTasks === b.totalTasks &&
    a.approved === b.approved &&
    a.rejected === b.rejected &&
    a.awaitingReview === b.awaitingReview &&
    a.inPipeline === b.inPipeline
  );
}

/** Map UI tab key → ?status= query-param value (empty string = no filter). */
function tabToStatusParam(tab: AdminTab): string {
  switch (tab) {
    case "awaiting_review": return "pipeline_passed";
    case "approved": return "approved";
    case "rejected": return "rejected";
    case "all": return "";
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 300_000; // background poll cadence (5 minutes)

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<BenchmarkStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>("awaiting_review");
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  // Keep a ref to activeTab so fetchData closures always read the current tab
  // without needing to be recreated every time the tab changes.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // ── Core data fetcher ────────────────────────────────────────────────────

  /**
   * fetchData
   *
   * @param isBackgroundPoll  When true, skips the full-page loading spinner.
   * @param force             When true, bypasses the isSameTasks equality
   *                          guard and always commits the new task array to
   *                          state. Use this after user-initiated actions where
   *                          a race between the HTTP response and a DB write
   *                          could otherwise make the state look unchanged.
   */
  const fetchData = useCallback(
    async (isBackgroundPoll = false, force = false) => {
      if (!isBackgroundPoll) setLoading(true);
      try {
        const statusParam = tabToStatusParam(activeTabRef.current);
        const query = statusParam ? `?status=${statusParam}` : "";

        const [tasksData, statsData] = await Promise.all([
          fetch(`/api/admin/ready-tasks${query}`).then((r) => r.json()),
          fetch("/api/admin/stats").then((r) => r.json()),
        ]);

        const newTasks = Array.isArray(tasksData) ? tasksData : [];
        const newStats = statsData ?? null;

        // Only skip state update when NOT forced AND the data looks identical.
        // The force flag is set after user actions so we always re-render even
        // if the DB write and the refetch landed at the exact same millisecond.
        setTasks((prev) =>
          !force && isSameTasks(prev, newTasks) ? prev : newTasks
        );
        setStats((prev) =>
          !force && isSameStats(prev, newStats) ? prev : newStats
        );
      } catch {
        if (!isBackgroundPoll) setTasks([]);
      } finally {
        if (!isBackgroundPoll) setLoading(false);
      }
    },
    [] // no deps — reads activeTab from ref so the closure never goes stale
  );

  // ── Initial load + re-fetch when tab changes ─────────────────────────────

  useEffect(() => {
    fetchData(false, false);
  }, [activeTab, fetchData]);

  // ── Background polling (safety net for when SSE is dead) ─────────────────

  useEffect(() => {
    const id = setInterval(() => {
      fetchData(true, false);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [fetchData]);

  // ── SSE integration ───────────────────────────────────────────────────────

  // The SSE hook now connects through the Next.js proxy route at
  // /api/sia/events — this works in Docker, dev, and production alike
  // because the Next.js server always knows how to reach the backend
  // (via BACKEND_URL env var on the server side), and the browser always
  // reaches Next.js at the same origin.
  //
  // When an SSE event arrives we do a background force-refresh so the UI
  // reflects the new siaStatus immediately rather than waiting for the
  // next poll cycle.

  useSiaSSE({
    onUpdate: useCallback(
      (taskId: string, siaStatus: string, extra: Record<string, unknown>) => {
        // Cast the raw string from the SSE event to the SiaStatus literal union.
        // The backend only ever sends valid values; the cast is safe.
        const typedSiaStatus = siaStatus as SiaStatus;

        // 1. Instant local patch — update this specific task's siaStatus
        //    (and siaHash if the event carries one) so the UI reacts in < 50 ms
        //    without waiting for a round-trip to the DB.
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t;
            return {
              ...t,
              siaStatus: typedSiaStatus,
              ...(extra.sia_hash ? { siaHash: extra.sia_hash as string } : {}),
            };
          })
        );

        // 2. Fire a background force-refresh to sync any other fields the
        //    event didn't carry (e.g. approvedAt, updatedAt).
        fetchData(true, true);
      },
      [fetchData]
    ),
    onConnected: useCallback(() => setSseConnected(true), []),
    onDisconnected: useCallback(() => setSseConnected(false), []),
  });

  // ── Action handlers ───────────────────────────────────────────────────────

  /**
   * approveTask
   *
   * Approves a pipeline-passed task. Sia upload has already happened as
   * part of the pipeline (stage 9), so this simply flips status to "approved".
   * No optimistic Sia state update needed.
   */
  const approveTask = useCallback(
    async (task: Task) => {
      setActing(task.id);

      // Optimistic update — show approved immediately
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "approved" as const } : t
        )
      );

      try {
        const res = await fetch(
          `/api/projects/${task.projectId}/tasks/${task.id}/approve`,
          { method: "POST" }
        );

        if (res.ok) {
          await fetchData(true, true);
        } else {
          // Roll back the optimistic update
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id ? { ...t, status: task.status } : t
            )
          );
        }
      } catch {
        // Network error — roll back
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id ? { ...t, status: task.status } : t
          )
        );
      } finally {
        setActing(null);
      }
    },
    [fetchData]
  );

  /**
   * rejectTask
   *
   * Immediately removes the task from local state (optimistic), then
   * refreshes stats in the background. No SSE needed.
   */
  const rejectTask = useCallback(
    async (task: Task) => {
      setActing(task.id);
      try {
        const res = await fetch(
          `/api/projects/${task.projectId}/tasks/${task.id}/reject`,
          { method: "POST" }
        );
        if (res.ok) {
          // Remove from list immediately
          setTasks((prev) => prev.filter((t) => t.id !== task.id));
          if (expanded === task.id) setExpanded(null);
          // Refresh stats counter in background
          fetch("/api/admin/stats")
            .then((r) => r.json())
            .then((d) => setStats(d ?? null))
            .catch(() => { });
        }
      } finally {
        setActing(null);
      }
    },
    [expanded]
  );

  /**
   * revertTask
   *
   * Immediately removes the task from the current tab's list (optimistic),
   * then refreshes stats in the background. No SSE needed.
   */
  const revertTask = useCallback(
    async (task: Task) => {
      setActing(task.id);
      try {
        const res = await fetch(
          `/api/projects/${task.projectId}/tasks/${task.id}/revert`,
          { method: "POST" }
        );
        if (res.ok) {
          setTasks((prev) => prev.filter((t) => t.id !== task.id));
          if (expanded === task.id) setExpanded(null);
          fetch("/api/admin/stats")
            .then((r) => r.json())
            .then((d) => setStats(d ?? null))
            .catch(() => { });
        }
      } finally {
        setActing(null);
      }
    },
    [expanded]
  );

  // ── Tab change ────────────────────────────────────────────────────────────

  const handleSetActiveTab = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    setExpanded(null);
  }, []);

  // ── Manual refresh ────────────────────────────────────────────────────────

  const refresh = useCallback(() => {
    fetchData(false, true);
  }, [fetchData]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminContext.Provider
      value={{
        tasks,
        stats,
        loading,
        activeTab,
        acting,
        expanded,
        sseConnected,
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