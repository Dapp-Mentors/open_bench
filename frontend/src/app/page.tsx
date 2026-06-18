// src/app/page.tsx
//
// Root landing page — visible to everyone.
// Authenticated users get a shortcut to /dashboard.
// Unauthenticated users see the product pitch and a link to /login.

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const PIPELINE_STAGES = [
  { label: "Similarity", desc: "Embedding cosine check against approved tasks" },
  { label: "CI Checks", desc: "Bash syntax, Python compile, Docker build" },
  { label: "Quality", desc: "LLM-as-judge across 11 criteria" },
  { label: "Preflight", desc: "pytest --collect-only inside the built image" },
  { label: "Oracle / NOP", desc: "Solution must pass; tests alone must fail" },
  { label: "Easiness", desc: "5-run prefilter — target 1 / 5 passing" },
  { label: "Difficulty", desc: "5-run check — target 1–3 / 5 passing" },
  { label: "Agent Quality", desc: "LLM-as-judge on instruction realism" },
];

export default async function Home() {
  const session = await auth();

  // Authenticated users go straight to the dashboard
  if (session?.user) {
    redirect("/dashboard");
  }

  // Unauthenticated users see the landing page
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)", color: "var(--text)" }}>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center">
        <p
          className="font-mono text-xs tracking-[0.3em] uppercase mb-6"
          style={{ color: "var(--subtle)" }}
        >
          Open Infrastructure
        </p>
        <h1
          className="font-mono text-4xl sm:text-5xl font-semibold leading-tight mb-6"
          style={{ color: "var(--text)" }}
        >
          Reproducible AI<br />benchmark curation
        </h1>
        <p
          className="font-mono text-sm leading-relaxed max-w-xl mx-auto mb-10"
          style={{ color: "var(--subtle)" }}
        >
          Each task is a realistic command-line challenge — a broken build, a failing
          service, a bad config. Agents solve it through the terminal. Tests verify it.
          Results live on the Sia Network forever.
        </p>
        <Link
          href="/login"
          className="inline-block font-mono text-sm px-6 py-3 rounded-lg transition-all"
          style={{
            background: "rgba(0,230,118,0.08)",
            border: "1px solid rgba(0,230,118,0.3)",
            color: "var(--green, #00e676)",
          }}
          onMouseEnter={undefined}
        >
          Get started →
        </Link>
      </section>

      {/* ── Pipeline stages ──────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <p
          className="font-mono text-xs tracking-[0.25em] uppercase mb-6"
          style={{ color: "var(--subtle)" }}
        >
          8-stage curation pipeline
        </p>
        <div className="grid gap-2">
          {PIPELINE_STAGES.map((stage, i) => (
            <div
              key={stage.label}
              className="flex items-start gap-4 px-4 py-3 rounded-lg"
              style={{ border: "1px solid var(--border)", background: "var(--surface, transparent)" }}
            >
              <span
                className="font-mono text-xs pt-0.5 tabular-nums shrink-0"
                style={{ color: "var(--subtle)", minWidth: "1.5rem" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <span className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                  {stage.label}
                </span>
                <span
                  className="font-mono text-xs ml-3"
                  style={{ color: "var(--subtle)" }}
                >
                  {stage.desc}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}