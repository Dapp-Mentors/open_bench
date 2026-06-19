"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Check,
  X,
  Plus,
  Save,
  RefreshCw,
  GripVertical,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";

interface BenchmarkType {
  id: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

export default function BenchmarkTypesPage() {
  const [types, setTypes] = useState<BenchmarkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newId, setNewId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BenchmarkType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/benchmark-types");
      if (res.ok) {
        setTypes(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function toggleActive(type: BenchmarkType) {
    setSaving(type.id);
    try {
      const res = await fetch("/api/admin/benchmark-types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: type.id, active: !type.active }),
      });
      if (res.ok) {
        setTypes((prev) =>
          prev.map((t) => (t.id === type.id ? { ...t, active: !t.active } : t)),
        );
        setToast({ type: "success", msg: `${type.label} ${type.active ? "disabled" : "enabled"}` });
      } else {
        setToast({ type: "error", msg: "Failed to update" });
      }
    } catch {
      setToast({ type: "error", msg: "Network error" });
    } finally {
      setSaving(null);
    }
  }

  async function deleteType() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/benchmark-types?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setTypes((prev) => prev.filter((t) => t.id !== deleteTarget.id));
        setToast({ type: "success", msg: `"${deleteTarget.label}" deleted` });
        setDeleteTarget(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", msg: data.error ?? "Failed to delete" });
      }
    } catch {
      setToast({ type: "error", msg: "Network error" });
    } finally {
      setDeleting(false);
    }
  }

  async function createType() {
    if (!newId.trim() || !newLabel.trim()) return;
    setSaving("new");
    try {
      const res = await fetch("/api/admin/benchmark-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newId.trim(), label: newLabel.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setTypes((prev) => [...prev, created]);
        setNewId("");
        setNewLabel("");
        setShowNew(false);
        setToast({ type: "success", msg: `"${created.label}" created` });
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: "error", msg: data.error ?? "Failed to create" });
      }
    } catch {
      setToast({ type: "error", msg: "Network error" });
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center py-20 font-mono text-sm" style={{ color: "var(--subtle)" }}>
          <span className="animate-pulse">▋</span> Loading benchmark types…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.7)" }}
        >
          <div
            className="w-full max-w-md rounded-xl p-6"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start gap-4 mb-5">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: "rgba(255,68,68,0.1)",
                  border: "1px solid rgba(255,68,68,0.25)",
                }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: "var(--red)" }} />
              </div>
              <div>
                <h2
                  className="font-mono text-sm font-semibold mb-1"
                  style={{ color: "var(--text)" }}
                >
                  Delete benchmark type
                </h2>
                <p
                  className="font-mono text-xs leading-relaxed"
                  style={{ color: "var(--subtle)" }}
                >
                  This will permanently remove{" "}
                  <span style={{ color: "var(--text)" }}>{deleteTarget.label}</span>{" "}
                  ({deleteTarget.id}). Existing projects referencing this type will
                  not be affected.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="bench-btn-ghost px-4 py-2 rounded text-xs font-mono disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={deleteType}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "rgba(255,68,68,0.1)",
                  border: "1px solid rgba(255,68,68,0.3)",
                  color: "var(--red)",
                }}
              >
                {deleting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-20 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg font-mono text-xs transition-all"
          style={{
            background: toast.type === "success" ? "rgba(0,230,118,0.1)" : "rgba(255,68,68,0.1)",
            border: `1px solid ${toast.type === "success" ? "rgba(0,230,118,0.3)" : "rgba(255,68,68,0.3)"}`,
            color: toast.type === "success" ? "var(--green)" : "var(--red)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          {toast.type === "success" ? <Check className="w-3.5 h-3.5" /> : <span>✕</span>}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="section-label mb-2">Settings</div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--text)" }}>
            <BarChart3 className="w-6 h-6" style={{ color: "#818cf8" }} />
            Benchmark Types
          </h1>
          <p className="text-xs mt-1.5" style={{ color: "var(--subtle)" }}>
            Manage which benchmark categories appear on the project creation form.
            Only active types are shown to users.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNew(true)}
            className="bench-btn-primary flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Type
          </button>
          <button
            onClick={fetchTypes}
            className="bench-btn-ghost flex items-center gap-1.5 px-3 py-2 rounded text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* New type form */}
      {showNew && (
        <div
          className="mb-6 p-4 rounded-lg border"
          style={{
            background: "rgba(99,102,241,0.03)",
            borderColor: "rgba(99,102,241,0.2)",
          }}
        >
          <div className="section-label mb-3" style={{ color: "#818cf8" }}>New Benchmark Type</div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-mono mb-1" style={{ color: "var(--subtle)" }}>ID (slug)</label>
              <input
                type="text"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="e.g. medical_imaging"
                className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-mono mb-1" style={{ color: "var(--subtle)" }}>Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Medical Imaging"
                className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={createType}
                disabled={!newId.trim() || !newLabel.trim() || saving === "new"}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-mono disabled:opacity-40"
                style={{
                  background: "rgba(99,102,241,0.1)",
                  color: "#818cf8",
                  border: "1px solid rgba(99,102,241,0.3)",
                }}
              >
                {saving === "new" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Create
              </button>
              <button
                onClick={() => { setShowNew(false); setNewId(""); setNewLabel(""); }}
                className="bench-btn-ghost px-3 py-2 rounded text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Types list */}
      {types.length === 0 ? (
        <div
          className="text-center py-20 border rounded-lg"
          style={{ borderColor: "var(--border)", borderStyle: "dashed" }}
        >
          <BarChart3 className="w-8 h-8 mx-auto mb-4" style={{ color: "var(--subtle)" }} />
          <p className="font-mono text-sm mb-1" style={{ color: "var(--text)" }}>
            No benchmark types defined
          </p>
          <p className="text-xs" style={{ color: "var(--subtle)" }}>
            Click "Add Type" to create the first one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {types.map((type) => {
            const isSaving = saving === type.id;
            return (
              <div
                key={type.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg"
                style={{
                  background: type.active ? "var(--surface)" : "rgba(140,148,168,0.03)",
                  border: `1px solid ${type.active ? "var(--border)" : "rgba(140,148,168,0.1)"}`,
                  opacity: type.active ? 1 : 0.6,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <GripVertical className="w-4 h-4 flex-shrink-0" style={{ color: "var(--muted)" }} />
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                      {type.label}
                    </div>
                    <div className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                      {type.id}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--muted)",
                      color: "var(--subtle)",
                    }}
                  >
                    #{type.sortOrder}
                  </span>

                  <button
                    onClick={() => toggleActive(type)}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-all disabled:opacity-40"
                    style={{
                      background: type.active
                        ? "rgba(0,230,118,0.08)"
                        : "rgba(140,148,168,0.08)",
                      color: type.active ? "var(--green)" : "var(--subtle)",
                      border: `1px solid ${
                        type.active
                          ? "rgba(0,230,118,0.2)"
                          : "rgba(140,148,168,0.2)"
                      }`,
                    }}
                  >
                    {isSaving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : type.active ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                    {type.active ? "Active" : "Disabled"}
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => setDeleteTarget(type)}
                    disabled={isSaving}
                    className="p-1.5 rounded transition-all"
                    style={{ color: "var(--muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                    title={`Delete ${type.label}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info footer */}
      <div
        className="mt-8 px-4 py-3 rounded-lg text-xs font-mono"
        style={{
          background: "rgba(0,230,118,0.03)",
          border: "1px solid rgba(0,230,118,0.1)",
          color: "var(--subtle)",
        }}
      >
        Only types marked as <span style={{ color: "var(--green)" }}>Active</span> will appear in the
        project creation form. Disabled types are hidden from users but existing projects
        referencing them will continue to work.
      </div>
    </div>
  );
}