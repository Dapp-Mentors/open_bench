"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, X, FileArchive, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

const LANGUAGES = [
  "Python", "JavaScript", "TypeScript", "Rust", "Solidity",
];

type SubmitState = "idle" | "uploading" | "success" | "error";

export default function SubmitTask() {
  const router = useRouter();

  const [domain, setDomain] = useState("");
  const [language, setLanguage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".zip")) {
      setError("Only .zip files are accepted.");
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const canSubmit = domain.trim().length > 0 && language.length > 0 && file !== null && state === "idle";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setState("uploading");
    setError(null);

    try {
      const body = new FormData();
      body.append("domain", domain.trim());
      body.append("language", language);
      body.append("file", file!);

      const res = await fetch("/api/tasks/submit", { method: "POST", body });
      if (!res.ok) {
        const msg = await res.text().catch(() => "Upload failed.");
        throw new Error(msg || "Upload failed.");
      }

      setState("success");
      setTimeout(() => router.push("/dashboard"), 1800);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
      setState("error");
    }
  };

  if (state === "success") {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "rgba(0,230,118,0.1)", border: "1px solid rgba(0,230,118,0.3)" }}
        >
          <CheckCircle className="w-7 h-7" style={{ color: "var(--green)" }} />
        </div>
        <h2 className="font-display font-bold text-xl mb-2" style={{ color: "var(--text)" }}>
          Task submitted
        </h2>
        <p className="text-sm font-mono" style={{ color: "var(--subtle)" }}>
          Redirecting to dashboard…
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      {/* Back */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-xs font-mono mb-6 transition-colors"
        style={{ color: "var(--subtle)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Dashboard
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="section-label mb-2">Curation Pipeline</div>
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text)" }}>
          Submit a Task
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--subtle)", lineHeight: 1.6 }}>
          Upload a <span className="font-mono" style={{ color: "var(--text)" }}>.zip</span> built
          to the{" "}
          <a
            href="https://www.harborframework.com/docs/tasks"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
            style={{ color: "var(--green)" }}
          >
            Harbor spec
          </a>
          . The pipeline runs automatically once uploaded.
        </p>
      </div>

      <div className="space-y-5">
        {/* Domain */}
        <div>
          <label
            htmlFor="domain"
            className="block section-label mb-2"
          >
            Domain
          </label>
          <input
            id="domain"
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. Solidity smart contract debugging"
            maxLength={80}
            className="w-full px-3 py-2.5 rounded text-sm font-mono outline-none transition-colors"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(0,230,118,0.4)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
          <p className="mt-1.5 text-xs font-mono" style={{ color: "var(--muted)" }}>
            A few words describing what the task is about.
          </p>
        </div>

        {/* Language */}
        <div>
          <label className="block section-label mb-2">
            Primary Language
          </label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => {
              const active = language === lang;
              return (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className="px-3 py-1.5 rounded text-xs font-mono transition-all"
                  style={{
                    background: active ? "rgba(0,230,118,0.1)" : "var(--surface)",
                    border: active ? "1px solid rgba(0,230,118,0.4)" : "1px solid var(--border)",
                    color: active ? "var(--green)" : "var(--subtle)",
                  }}
                >
                  {lang}
                </button>
              );
            })}
          </div>
        </div>

        {/* ZIP upload */}
        <div>
          <label className="block section-label mb-2">
            Task ZIP
          </label>

          {file ? (
            /* File selected — show summary */
            <div
              className="flex items-center justify-between px-4 py-3 rounded"
              style={{
                background: "rgba(0,230,118,0.05)",
                border: "1px solid rgba(0,230,118,0.25)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileArchive className="w-4 h-4 flex-shrink-0" style={{ color: "var(--green)" }} />
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium truncate" style={{ color: "var(--text)" }}>
                    {file.name}
                  </p>
                  <p className="font-mono text-xs" style={{ color: "var(--subtle)" }}>
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setFile(null); setError(null); }}
                className="p-1 rounded transition-colors flex-shrink-0"
                style={{ color: "var(--muted)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Drop zone */
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className="flex flex-col items-center justify-center gap-2 py-10 rounded cursor-pointer transition-colors"
              style={{
                background: drag ? "rgba(0,230,118,0.04)" : "var(--surface)",
                border: `1px dashed ${drag ? "rgba(0,230,118,0.5)" : "var(--border)"}`,
              }}
            >
              <Upload className="w-5 h-5" style={{ color: drag ? "var(--green)" : "var(--muted)" }} />
              <p className="text-sm font-mono" style={{ color: drag ? "var(--green)" : "var(--subtle)" }}>
                Drop .zip here or <span style={{ color: "var(--green)" }}>browse</span>
              </p>
              <p className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                Must follow flat-root Harbor layout
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        {/* Error */}
        {(error || state === "error") && (
          <div
            className="px-4 py-3 rounded text-xs font-mono"
            style={{
              background: "rgba(255,68,68,0.06)",
              border: "1px solid rgba(255,68,68,0.25)",
              color: "var(--red)",
            }}
          >
            {error ?? "Submission failed. Check your file and try again."}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href="/dashboard"
            className="bench-btn-ghost px-4 py-2.5 rounded text-sm font-mono"
          >
            Cancel
          </Link>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bench-btn-primary px-5 py-2.5 rounded text-sm font-mono flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === "uploading" ? (
              <>
                <span
                  className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                Submit Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}