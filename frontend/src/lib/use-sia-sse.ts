"use client";

/**
 * use-sia-sse.ts
 *
 * React hook that subscribes to the SSE endpoint for real-time Sia pipeline
 * status updates.
 *
 * Key changes from the broken version:
 *
 * 1. PROXIED URL — always connects to /api/sia/events (the Next.js proxy
 *    route) instead of http://localhost:8000/api/sia/events. The proxy runs
 *    server-side where BACKEND_URL resolves correctly in every environment:
 *    Docker (http://backend:8000), bare-metal dev (http://localhost:8000),
 *    and production. The browser only ever talks to the same origin.
 *
 * 2. CONNECTION STATUS CALLBACKS — onConnected / onDisconnected let the
 *    parent context track whether the SSE stream is actually live. The admin
 *    page uses this to show a subtle indicator so operators know if real-time
 *    updates are working or if the UI is falling back to polling.
 *
 * 3. EXPONENTIAL BACKOFF — reconnect delay starts at 1 s and doubles on each
 *    failure up to a 30 s ceiling, rather than a fixed 3 s. This avoids
 *    hammering the server when the backend is genuinely down.
 *
 * 4. VISIBILITY-AWARE RECONNECT — reconnects immediately when the browser tab
 *    becomes visible again after being hidden, so an admin coming back to a
 *    backgrounded tab doesn't have to wait for the next poll cycle.
 */

import { useEffect, useRef, useCallback } from "react";

interface SiaUpdateEvent {
  taskId: string;
  siaStatus: string;
  siaHash?: string;
  [key: string]: unknown;
}

interface UseSiaSSEOptions {
  onUpdate: (
    taskId: string,
    siaStatus: string,
    extra: Record<string, unknown>
  ) => void;
  /** Called once the EventSource opens successfully. */
  onConnected?: () => void;
  /** Called whenever the connection is lost (before reconnect). */
  onDisconnected?: () => void;
}

// Always go through the Next.js API proxy.
// The proxy route (app/api/sia/events/route.ts) pipes the response from the
// Python backend, which lives at BACKEND_URL inside the server runtime.
// This works in Docker, bare-metal dev, and production without any env var
// being exposed to the browser.
const SSE_URL = "/api/sia/events";

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS     = 30_000;

export function useSiaSSE({
  onUpdate,
  onConnected,
  onDisconnected,
}: UseSiaSSEOptions) {
  // Use refs for the callbacks so the effect closure never goes stale —
  // we can update the callbacks without tearing down the EventSource.
  const onUpdateRef       = useRef(onUpdate);
  const onConnectedRef    = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  onUpdateRef.current       = onUpdate;
  onConnectedRef.current    = onConnected;
  onDisconnectedRef.current = onDisconnected;

  // Stable ref so the visibility handler can call reconnect()
  const reconnectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = BACKOFF_INITIAL_MS;
    let destroyed = false; // set on cleanup so pending timers don't re-open

    function connect() {
      if (destroyed) return;
      if (eventSource) eventSource.close();

      eventSource = new EventSource(SSE_URL);

      eventSource.onopen = () => {
        // Reset backoff on a successful connection
        backoffMs = BACKOFF_INITIAL_MS;
        onConnectedRef.current?.();
      };

      eventSource.addEventListener("sia-update", (e: MessageEvent) => {
        try {
          const data: SiaUpdateEvent = JSON.parse(e.data);
          const { taskId, siaStatus, ...extra } = data;
          onUpdateRef.current(taskId, siaStatus, extra);
        } catch {
          // Ignore malformed events — don't crash the stream
        }
      });

      eventSource.onerror = () => {
        eventSource?.close();
        onDisconnectedRef.current?.();

        if (!destroyed) {
          // Exponential backoff before reconnecting
          reconnectTimer = setTimeout(() => {
            backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
            connect();
          }, backoffMs);
        }
      };
    }

    // Expose connect() so the visibility handler can call it
    reconnectRef.current = connect;

    connect();

    // Reconnect immediately when the tab becomes visible again.
    // Without this, an admin returning to a backgrounded tab might wait up
    // to BACKOFF_MAX_MS for the next reconnect attempt.
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectRef.current?.();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      destroyed = true;
      if (eventSource) eventSource.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      onDisconnectedRef.current?.();
    };
  }, []); // empty deps — SSE_URL is a module-level constant
}