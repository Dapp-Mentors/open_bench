"use client";

/**
 * useSiaSSE
 *
 * React hook that subscribes to the backend SSE endpoint for real-time
 * Sia pipeline status updates. Avoids continuous polling.
 *
 * Usage:
 *   useSiaSSE({
 *     onUpdate: (taskId, siaStatus, extra) => {
 *       // Update local state, trigger refetch, etc.
 *     },
 *   });
 *
 * The hook auto-reconnects if the connection drops.
 */

import { useEffect, useRef, useCallback } from "react";

interface SiaUpdateEvent {
  taskId: string;
  siaStatus: string;
  siaHash?: string;
  [key: string]: unknown;
}

interface UseSiaSSEOptions {
  onUpdate: (taskId: string, siaStatus: string, extra: Record<string, unknown>) => void;
  /** Backend URL. Defaults to derived from window.location or BACKEND_URL env. */
  backendUrl?: string;
}

export function useSiaSSE({ onUpdate, backendUrl }: UseSiaSSEOptions) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const resolveUrl = useCallback(() => {
    if (backendUrl) return `${backendUrl}/api/sia/events`;
    // In development, the backend runs on port 8000
    if (process.env.NEXT_PUBLIC_BACKEND_URL) {
      return `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/sia/events`;
    }
    // Fallback: same origin proxy or direct to localhost:8000
    return "http://localhost:8000/api/sia/events";
  }, [backendUrl]);

  useEffect(() => {
    const url = resolveUrl();
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource(url);

      eventSource.addEventListener("sia-update", (e: MessageEvent) => {
        try {
          const data: SiaUpdateEvent = JSON.parse(e.data);
          const { taskId, siaStatus, ...extra } = data;
          onUpdateRef.current(taskId, siaStatus, extra);
        } catch {
          // Ignore malformed events
        }
      });

      eventSource.onerror = () => {
        eventSource?.close();
        // Reconnect after 3 seconds on error
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [resolveUrl]);
}