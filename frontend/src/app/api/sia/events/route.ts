/**
 * app/api/sia/events/route.ts
 *
 * Next.js SSE proxy — pipes the Python backend's /api/sia/events stream
 * through the Next.js server so the browser never has to reach the backend
 * directly.
 *
 * Why this exists:
 *   The browser can always reach the Next.js server (same origin).
 *   The Next.js server can always reach the Python backend via BACKEND_URL
 *   (in Docker: http://backend:8000, in dev: http://localhost:8000).
 *   Without this proxy, the browser would try to hit http://localhost:8000
 *   from inside a Docker container — which silently fails, leaving the SSE
 *   stream dead and the UI stuck waiting for events that never arrive.
 *
 * This route:
 *   1. Opens a fetch() to the backend's SSE endpoint (server-side, so
 *      Docker networking works).
 *   2. Streams the response body straight back to the browser as
 *      text/event-stream.
 *   3. Forwards the keep-alive and no-cache headers so proxies / load
 *      balancers (nginx, Vercel, etc.) don't buffer the stream.
 *
 * No authentication is added here — access control is handled upstream
 * at the Next.js middleware layer, consistent with the rest of the admin
 * routes.
 */

import { NextResponse } from "next/server";

// In Docker: BACKEND_URL=http://backend:8000 (set in docker-compose.yml)
// In dev:    BACKEND_URL=http://localhost:8000  (set in .env.local)
// Fallback keeps bare-metal dev working without any env config.
const BACKEND_URL =
    process.env.BACKEND_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic"; // never cache this route

export async function GET() {
    try {
        const upstream = await fetch(`${BACKEND_URL}/api/sia/events`, {
            headers: {
                Accept: "text/event-stream",
                "Cache-Control": "no-cache",
            },
            // Node 18+ fetch supports streaming response bodies.
            // @ts-expect-error — duplex is required for streaming in some runtimes
            duplex: "half",
        });

        if (!upstream.ok) {
            return new NextResponse(
                `Upstream SSE error: ${upstream.status} ${upstream.statusText}`,
                { status: 502 }
            );
        }

        // Pipe the upstream body straight to the client.
        // NextResponse accepts a ReadableStream as the body.
        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                // Tell nginx / Vercel edge not to buffer SSE
                "X-Accel-Buffering": "no",
                // Allow the browser to receive events across a same-origin redirect
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (err) {
        // Backend is unreachable — return a proper error so the client's
        // EventSource onerror fires and triggers a reconnect with backoff,
        // rather than hanging indefinitely.
        console.error("[SSE proxy] Failed to connect to backend:", err);
        return new NextResponse("SSE backend unavailable", { status: 503 });
    }
}