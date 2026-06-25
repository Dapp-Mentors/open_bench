"use client";

/**
 * pipeline-retry-context.tsx
 *
 * Central state management for pipeline retry operations across the task list.
 * Follows the same pattern as admin-context.tsx.
 *
 * Why a context instead of local useState in TaskRow:
 *   - Coordinated UI: a notification/toast can react when ANY task's retry completes
 *   - Shared loading state: other components can disable actions while any retry is in flight
 *   - Future-proof: adding new retry-able stages (e.g. Sia, agent quality) just needs a new handler here
 *   - Consistency: the admin panel already uses AdminContext for approve/reject/revert actions
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetryState {
  /** task.id → true while its retry is in flight */
  retrying: Record<string, boolean>;
  /** task.id → optimistic status override (e.g. "pending" right after retry) */
  optimisticStatuses: Record<string, string>;
  /** task.id → optimistic retry count */
  optimisticRetries: Record<string, number>;
}

interface PipelineRetryContextValue {
  retryState: RetryState;
  /** Initiate a difficulty probe retry for a specific task */
  retryDifficulty: (taskId: string) => Promise<boolean>;
  /** Clear retry state for a task (e.g. after data refresh catches up) */
  clearRetryState: (taskId: string) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PipelineRetryContext = createContext<PipelineRetryContextValue | null>(null);

export function usePipelineRetry(): PipelineRetryContextValue {
  const ctx = useContext(PipelineRetryContext);
  if (!ctx) {
    throw new Error(
      "usePipelineRetry must be used inside <PipelineRetryProvider>"
    );
  }
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PipelineRetryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [retryState, setRetryState] = useState<RetryState>({
    retrying: {},
    optimisticStatuses: {},
    optimisticRetries: {},
  });

  /**
   * Initiate a difficulty probe retry for a specific task.
   * Sets optimistic state immediately, then calls the API.
   * Returns true on success, false on failure.
   */
  const retryDifficulty = useCallback(async (taskId: string): Promise<boolean> => {
    // Optimistic update — mark as retrying immediately
    setRetryState((prev) => ({
      ...prev,
      retrying: { ...prev.retrying, [taskId]: true },
    }));

    try {
      const res = await fetch(`/api/tasks/${taskId}/retry-difficulty`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to retry difficulty probe");
        setRetryState((prev) => ({
          ...prev,
          retrying: { ...prev.retrying, [taskId]: false },
        }));
        return false;
      }

      // Retry started successfully — update optimistic state
      setRetryState((prev) => ({
        retrying: { ...prev.retrying, [taskId]: false },
        optimisticStatuses: { ...prev.optimisticStatuses, [taskId]: "pending" },
        optimisticRetries: {
          ...prev.optimisticRetries,
          [taskId]: (prev.optimisticRetries[taskId] ?? 0) + 1,
        },
      }));

      return true;
    } catch {
      alert("Network error. Failed to retry difficulty probe.");
      setRetryState((prev) => ({
        ...prev,
        retrying: { ...prev.retrying, [taskId]: false },
      }));
      return false;
    }
  }, []);

  /**
   * Clear retry state for a task (e.g. after the background poll catches up
   * and the server data reflects the new state).
   */
  const clearRetryState = useCallback((taskId: string) => {
    setRetryState((prev) => {
      const newRetrying = { ...prev.retrying };
      delete newRetrying[taskId];
      const newStatuses = { ...prev.optimisticStatuses };
      delete newStatuses[taskId];
      const newRetries = { ...prev.optimisticRetries };
      delete newRetries[taskId];
      return {
        retrying: newRetrying,
        optimisticStatuses: newStatuses,
        optimisticRetries: newRetries,
      };
    });
  }, []);

  return (
    <PipelineRetryContext.Provider
      value={{
        retryState,
        retryDifficulty,
        clearRetryState,
      }}
    >
      {children}
    </PipelineRetryContext.Provider>
  );
}