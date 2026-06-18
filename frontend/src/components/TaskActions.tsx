"use client";

import { useState } from "react";
import { CheckCircle, Trash2 } from "lucide-react";
import type { Task } from "@/lib/types";

interface Props {
    task: Task;
    onApproved?: (taskId: string) => void;
    onDeleted?: (taskId: string) => void;
}

/**
 * Renders the contextual action buttons for a task card.
 *
 * Rules:
 *  - pipeline_running  → no buttons at all (don't interrupt the pipeline)
 *  - pipeline_passed   → Approve button + no Delete (it's a candidate, not trash)
 *  - rejected / failed → Delete button only
 *  - approved          → no destructive actions (task is locked in)
 *  - pending           → Delete button (it hasn't started yet)
 */
export function TaskActions({ task, onApproved, onDeleted }: Props) {
    const [busy, setBusy] = useState(false);

    const { status } = task;

    // Nothing to show while the pipeline is actively running
    if (status === "pipeline_running") return null;

    // Approved tasks are immutable from the UI side
    if (status === "approved") return null;

    async function handleApprove() {
        setBusy(true);
        try {
            const res = await fetch(
                `/api/projects/${task.projectId}/tasks/${task.id}/approve`,
                { method: "POST" },
            );
            if (res.ok) onApproved?.(task.id);
        } finally {
            setBusy(false);
        }
    }

    async function handleDelete() {
        if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
        setBusy(true);
        try {
            const res = await fetch(
                `/api/projects/${task.projectId}/tasks/${task.id}`,
                { method: "DELETE" },
            );
            if (res.ok) onDeleted?.(task.id);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex items-center gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
            {status === "pipeline_passed" && (
                <button
                    disabled={busy}
                    onClick={handleApprove}
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-mono transition-all"
                    style={{
                        background: "rgba(0,230,118,0.1)",
                        color: "var(--green)",
                        border: "1px solid rgba(0,230,118,0.25)",
                        opacity: busy ? 0.5 : 1,
                        cursor: busy ? "not-allowed" : "pointer",
                        boxShadow: busy ? "none" : "0 0 8px rgba(0,230,118,0.1)",
                    }}
                >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{busy ? "Approving…" : "Approve"}</span>
                </button>
            )}

            {(status === "pending" || status === "rejected") && (
                <button
                    disabled={busy}
                    onClick={handleDelete}
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded text-xs font-mono transition-all"
                    style={{
                        background: "rgba(255,68,68,0.06)",
                        color: "var(--red)",
                        border: "1px solid rgba(255,68,68,0.15)",
                        opacity: busy ? 0.5 : 1,
                        cursor: busy ? "not-allowed" : "pointer",
                    }}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{busy ? "Deleting…" : "Delete"}</span>
                </button>
            )}
        </div>
    );
}