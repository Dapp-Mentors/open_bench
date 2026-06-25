"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, FileArchive, X, CheckCircle, Loader2, AlertCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmitTaskPageProps {
    params: Promise<{ id: string }>;
}

type SubmitState = "idle" | "uploading" | "success" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────

function DropZone({
    file,
    onFile,
    onClear,
    disabled,
}: {
    file: File | null;
    onFile: (f: File) => void;
    onClear: () => void;
    disabled: boolean;
}) {
    const [dragging, setDragging] = useState(false);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            if (disabled) return;
            const dropped = e.dataTransfer.files[0];
            if (dropped?.name.endsWith(".zip")) onFile(dropped);
        },
        [disabled, onFile],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const picked = e.target.files?.[0];
            if (picked?.name.endsWith(".zip")) onFile(picked);
            e.target.value = "";
        },
        [onFile],
    );

    if (file) {
        return (
            <div
                className="flex items-center gap-3 px-4 py-4 rounded-lg border"
                style={{
                    background: "rgba(0,230,118,0.04)",
                    borderColor: "rgba(0,230,118,0.25)",
                }}
            >
                <FileArchive className="w-5 h-5 flex-shrink-0" style={{ color: "var(--green)" }} />
                <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                        {file.name}
                    </p>
                    <p className="font-mono text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
                        {formatBytes(file.size)}
                    </p>
                </div>
                {!disabled && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="p-1 rounded transition-colors"
                        style={{ color: "var(--muted)" }}
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    }

    return (
        <label
            className="flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-lg border-2 border-dashed cursor-pointer transition-all"
            style={{
                borderColor: dragging ? "rgba(77,166,255,0.5)" : "var(--border)",
                background: dragging ? "rgba(77,166,255,0.04)" : "transparent",
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
            }}
            onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
        >
            <Upload
                className="w-8 h-8"
                style={{ color: dragging ? "var(--blue)" : "var(--muted)" }}
            />
            <div className="text-center">
                <p className="font-mono text-sm" style={{ color: "var(--subtle)" }}>
                    Drop your <span style={{ color: "var(--text)" }}>.zip</span> here or{" "}
                    <span style={{ color: "var(--blue)" }}>browse</span>
                </p>
                <p className="font-mono text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Built to the Harbor spec · .zip only
                </p>
            </div>
            <input
                type="file"
                accept=".zip"
                className="sr-only"
                onChange={handleChange}
                disabled={disabled}
            />
        </label>
    );
}

// ─── Language Picker ──────────────────────────────────────────────────────────

const LANGUAGE_GROUPS = [
    {
        label: "Web",
        langs: ["TypeScript", "JavaScript", "HTML/CSS", "PHP", "Ruby", "Dart"],
    },
    {
        label: "AI / ML",
        langs: ["Python", "R"],
    },
    {
        label: "Smart Contracts",
        langs: ["Solidity", "Rust (Solana)"],
    },
    {
        label: "Systems / Other",
        langs: ["Rust", "Go", "C", "C++", "Java", "Kotlin", "Swift", "C#"],
    },
] as const;

function LanguagePicker({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
}) {
    return (
        <div className="space-y-2">
            {LANGUAGE_GROUPS.map((group) => (
                <div key={group.label}>
                    <p
                        className="font-mono text-xs mb-1.5"
                        style={{ color: "var(--muted)" }}
                    >
                        {group.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {group.langs.map((lang) => {
                            const selected = value === lang;
                            return (
                                <button
                                    key={lang}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => onChange(lang)}
                                    className="px-3 py-1.5 rounded border font-mono text-xs transition-all"
                                    style={{
                                        background: selected ? "rgba(77,166,255,0.12)" : "var(--surface)",
                                        borderColor: selected ? "rgba(77,166,255,0.45)" : "var(--border)",
                                        color: selected ? "var(--blue)" : "var(--subtle)",
                                        opacity: disabled ? 0.5 : 1,
                                        cursor: disabled ? "not-allowed" : "pointer",
                                        fontWeight: selected ? 600 : 400,
                                    }}
                                >
                                    {lang}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <label className="section-label">{label}</label>
                {hint && (
                    <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                        {hint}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubmitTaskPage({ params }: SubmitTaskPageProps) {
    const { id } = use(params);
    const router = useRouter();

    const [file, setFile] = useState<File | null>(null);
    const [domain, setDomain] = useState("");
    const [language, setLanguage] = useState("");
    const [state, setState] = useState<SubmitState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [taskId, setTaskId] = useState<string | null>(null);

    const isSubmitting = state === "uploading";
    const canSubmit = !!file && domain.trim().length > 0 && language.trim().length > 0 && !isSubmitting;

    async function handleSubmit() {
        if (!canSubmit || !file) return;
        setState("uploading");
        setError(null);

        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("domain", domain.trim());
            fd.append("language", language.trim());

            const res = await fetch(`/api/projects/${id}/tasks`, {
                method: "POST",
                body: fd,
            });

            let data: { id?: string; error?: string } = {}
            const contentType = res.headers.get('content-type') ?? ''
            if (contentType.includes('application/json')) {
                data = await res.json()
            } else {
                const text = await res.text()
                data = { error: text || `Server error ${res.status}` }
            }

            if (!res.ok) {
                throw new Error(data.error ?? `Upload failed (${res.status})`);
            }

            setTaskId(data.id ?? null);
            setState("success");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Something went wrong");
            setState("error");
        }
    }

    // ── Auto-redirect after successful submission ──────────────────────────────
    useEffect(() => {
        if (state === "success") {
            const timer = setTimeout(() => {
                router.push(`/projects/${id}`);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [state, id, router]);

    // ── Success screen ──────────────────────────────────────────────────────────
    if (state === "success") {
        return (
            <div className="max-w-lg mx-auto px-6 py-16 text-center">
                <div
                    className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
                    style={{ background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.25)" }}
                >
                    <CheckCircle className="w-7 h-7" style={{ color: "var(--green)" }} />
                </div>
                <h2 className="font-display text-xl font-bold mb-2" style={{ color: "var(--text)" }}>
                    Task submitted
                </h2>
                <p className="font-mono text-sm mb-1" style={{ color: "var(--subtle)" }}>
                    The Harbor pipeline has been triggered.
                </p>
                <p className="font-mono text-xs mb-6" style={{ color: "var(--muted)" }}>
                    Redirecting to project page in 3s…
                </p>
                {taskId && (
                    <p className="font-mono text-xs mb-6" style={{ color: "var(--muted)" }}>
                        task id: {taskId}
                    </p>
                )}
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={() => router.push(`/projects/${id}`)}
                        className="bench-btn-primary px-5 py-2 rounded text-xs"
                    >
                        View project
                    </button>
                    <button
                        onClick={() => {
                            setFile(null);
                            setDomain("");
                            setLanguage("");
                            setError(null);
                            setTaskId(null);
                            setState("idle");
                        }}
                        className="bench-btn-ghost px-5 py-2 rounded text-xs"
                    >
                        Submit another
                    </button>
                </div>
            </div>
        );
    }

    // ── Main form ───────────────────────────────────────────────────────────────
    return (
        <div className="max-w-2xl mx-auto px-6 py-10">

            {/* Back */}
            <Link
                href={`/projects/${id}`}
                className="inline-flex items-center gap-1.5 text-xs font-mono mb-6 transition-colors"
                style={{ color: "var(--subtle)" }}
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to project
            </Link>

            {/* Header */}
            <div className="mb-8">
                <div className="section-label mb-2">New Task</div>
                <h1 className="font-display text-2xl font-bold mb-1" style={{ color: "var(--text)" }}>
                    Submit a task
                </h1>
                <p className="text-sm" style={{ color: "var(--subtle)", lineHeight: 1.6 }}>
                    Upload a <span className="font-mono" style={{ color: "var(--text)" }}>.zip</span> built to
                    the Harbor spec. The pipeline will run 8 automated checks before queuing it for review.
                </p>
            </div>

            {/* Form */}
            <div className="space-y-6">

                {/* File upload */}
                <Field label="Task archive" hint=".zip · max 100 MB">
                    <DropZone
                        file={file}
                        onFile={setFile}
                        onClear={() => setFile(null)}
                        disabled={isSubmitting}
                    />
                </Field>

                {/* Domain */}
                <Field label="Domain" hint="e.g. finance, healthcare, devtools">
                    <input
                        type="text"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="e.g. devtools"
                        disabled={isSubmitting}
                        className="w-full px-4 py-2.5 rounded-lg border font-mono text-sm transition-colors outline-none"
                        style={{
                            background: "var(--surface)",
                            borderColor: "var(--border)",
                            color: "var(--text)",
                            opacity: isSubmitting ? 0.6 : 1,
                        }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(77,166,255,0.5)")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                    />
                </Field>

                {/* Language */}
                <Field label="Primary language" hint="programming language used in the task">
                    <LanguagePicker value={language} onChange={setLanguage} disabled={isSubmitting} />
                </Field>

                {/* Error */}
                {state === "error" && error && (
                    <div
                        className="flex items-start gap-2.5 px-4 py-3 rounded-lg border"
                        style={{ background: "rgba(255,68,68,0.06)", borderColor: "rgba(255,68,68,0.25)" }}
                    >
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--red)" }} />
                        <p className="font-mono text-xs" style={{ color: "var(--red)" }}>{error}</p>
                    </div>
                )}

                {/* Submit */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="bench-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Uploading…
                            </>
                        ) : (
                            <>
                                <Upload className="w-3.5 h-3.5" />
                                Submit task
                            </>
                        )}
                    </button>
                    <Link
                        href={`/projects/${id}`}
                        className="bench-btn-ghost px-5 py-2.5 rounded text-xs"
                    >
                        Cancel
                    </Link>
                </div>

                {/* Pipeline preview */}
                <div
                    className="mt-4 rounded-lg border p-4"
                    style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                    <p className="section-label mb-3">What happens after upload</p>
                    <ol className="space-y-2">
                        {[
                            { n: 1, label: "Similarity & Diversity", desc: "Cosine similarity vs approved tasks" },
                            { n: 2, label: "CI Checks", desc: "Container smoke test" },
                            { n: 3, label: "Quality Check", desc: "LLM score ≥ 0.6 across 11 criteria" },
                            { n: 4, label: "Validation pre-flight", desc: "pytest --collect-only passes" },
                            { n: 5, label: "Oracle / NOP Validation", desc: "Tests fail before, pass after solve.sh" },
                            { n: 6, label: "Easiness Prefilter", desc: "Model must not solve it (pass@5 = 1/5)" },
                            { n: 7, label: "Difficulty Probe", desc: "Frontier model must land 1–3/5 passes" },
                            { n: 8, label: "Agent Quality Check", desc: "Benchmark designer verdict" },
                            { n: 9, label: "Sia Network Upload", desc: "Decentralized storage via Sia" },
                        ].map(({ n, label, desc }) => (
                            <li key={n} className="flex items-start gap-3">
                                <span
                                    className="font-mono text-xs flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5"
                                    style={{ background: "var(--muted)", color: "var(--subtle)" }}
                                >
                                    {n}
                                </span>
                                <div>
                                    <span className="font-mono text-xs font-medium" style={{ color: "var(--text)" }}>
                                        {label}
                                    </span>
                                    <span className="font-mono text-xs sm:ml-2 block sm:inline mt-0.5 sm:mt-0" style={{ color: "var(--muted)" }}>
                                        · {desc}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>

            </div>
        </div>
    );
}