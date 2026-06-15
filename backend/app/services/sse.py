"""
app/services/sse.py
-------------------
Server-Sent Events hub for broadcasting Sia pipeline status changes
to connected frontend clients.

Usage (backend — send events):
    from app.services.sse import sia_broadcast
    sia_broadcast(task_id, "uploading")
    sia_broadcast(task_id, "ready", sia_hash="abc123")

Usage (frontend — receive events):
    const evtSource = new EventSource("/api/sia/events");
    evtSource.addEventListener("sia-update", (e) => {
        const { taskId, siaStatus, siaHash } = JSON.parse(e.data);
        // Update UI...
    });
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

# ── SSE client tracking ────────────────────────────────────────────────────────

_sia_clients: list[asyncio.Queue] = []


def sia_broadcast(task_id: str, sia_status: str, **extra: Any) -> None:
    """
    Push a Sia status event to all connected SSE clients.

    Each event is a JSON object with at least `taskId` and `siaStatus`.
    Extra keyword arguments (e.g. sia_hash) are included in the payload.
    """
    payload = json.dumps({
        "taskId": task_id,
        "siaStatus": sia_status,
        **extra,
    })
    # Deliver to all connected clients; drop if a client's queue is full
    stale: list[asyncio.Queue] = []
    for q in _sia_clients:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            stale.append(q)
    for q in stale:
        try:
            _sia_clients.remove(q)
        except ValueError:
            pass


async def sia_event_generator():
    """
    Async generator that yields SSE-formatted messages for Sia status changes.
    Pass this as the `content` of a StreamingResponse.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=256)
    _sia_clients.append(queue)
    try:
        while True:
            payload = await queue.get()
            yield f"event: sia-update\ndata: {payload}\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        try:
            _sia_clients.remove(queue)
        except ValueError:
            pass