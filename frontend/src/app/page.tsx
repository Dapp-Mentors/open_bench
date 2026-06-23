// src/app/page.tsx
//
// Root landing page - visible to everyone.
// Authenticated users get a shortcut to /dashboard.
// Unauthenticated users see the product pitch.

import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PIPELINE_STAGES = [
  { label: "Similarity", desc: "Embedding cosine check rejects tasks too close to existing ones (cosine > 0.85 → rejected). Keeps the training dataset diverse." },
  { label: "CI Checks", desc: "Bash syntax validation, Python compilation, Docker build. A task that won't build can't be used as a training example." },
  { label: "Quality", desc: "LLM-as-judge scores the task across 11 criteria (realism, clarity, verifiability). Average must meet ≥ 0.6." },
  { label: "Preflight", desc: "Runs pytest --collect-only inside the built image. At least 6 test functions required before any agent touches the task." },
  { label: "Oracle / NOP", desc: "Two containers run. NOP (no solution) must write reward = 0. Oracle (solve.sh + tests) must write reward = 1. Both must hold." },
  { label: "Easiness", desc: "CrewAI multi-agent probe runs 5 times with a fast model. 1–4 passing = calibrated. 0/5 means too hard; 5/5 means too easy for training." },
  { label: "Difficulty", desc: "Same probe, 5 runs, but now with the frontier model. Target: 1–3/5 passing. Ensures the task challenges state-of-the-art models." },
  { label: "Agent Quality", desc: "LLM-as-judge checks instruction realism, absence of leaked assertions, and whether the task is actually actionable." },
  { label: "Sia Upload", desc: "Approved training example is uploaded to Sia Network: immutable, content-addressed, publicly verifiable. The receipt is stored forever." },
];

const PROBLEMS = [
  {
    stat: "~60%",
    label: "of published AI benchmarks",
    detail: "can't be independently reproduced by third parties within 6 months of publication"
  },
  {
    stat: "0",
    label: "enforced verifiability standards",
    detail: "across the major AI evaluation frameworks in active use today"
  },
  {
    stat: "$B+",
    label: "in model training costs",
    detail: "are compared against benchmarks where task quality is never formally audited"
  },
];

export default async function Home() {
  const session = await auth();

  // Check if setup is complete — if not, redirect to setup wizard.
  // This applies to BOTH authenticated and unauthenticated visitors:
  // there's nothing to see on the landing or login pages until the
  // platform has been configured by a super admin.
  try {
    const settings = await prisma.appSettings.findUnique({
      where: { id: "default" },
      select: { setupComplete: true },
    });
    if (!settings?.setupComplete) {
      redirect("/setup");
    }
  } catch {
    // AppSettings table may not exist yet (fresh DB), redirect to setup
    redirect("/setup");
  }

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)" }}>

      {/* ── Hero ── */}
      <section className="relative max-w-4xl mx-auto px-6 pt-28 pb-20">
        {/* Faint grid background */}
        <div
          className="absolute inset-0 grid-bg opacity-30 pointer-events-none"
          style={{ maskImage: "radial-gradient(ellipse at center, black 0%, transparent 70%)" }}
        />

        <div className="relative text-center">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[11px] tracking-widest uppercase mb-8"
            style={{
              background: "rgba(0,230,118,0.06)",
              border: "1px solid rgba(0,230,118,0.18)",
              color: "var(--green)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--green)" }}
            />
            Open Infrastructure · Public Beta
          </div>

          <h1
            className="font-mono text-4xl sm:text-6xl font-semibold leading-none mb-6"
            style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
          >
            AI dataset curation<br />
            <span style={{ color: "var(--green)" }}>for model trainings.</span>
          </h1>

          <p
            className="font-mono text-sm sm:text-base leading-relaxed max-w-2xl mx-auto mb-4"
            style={{ color: "var(--subtle)" }}
          >
            Most AI training data is assembled without rigorous quality checks. Tasks leak solutions,
            instructions are ambiguous, difficulty is miscalibrated, and there's no way to verify
            what you're training against.
          </p>
          <p
            className="font-mono text-sm sm:text-base leading-relaxed max-w-2xl mx-auto mb-10"
            style={{ color: "var(--text-muted)" }}
          >
            OpenBench is an AI dataset curation and evaluation platform for AI model trainings. A 9-stage
            automated pipeline validates every task for syntactic correctness, instructional quality,
            solvability, and calibrated difficulty before it reaches the training data registry. Every approved
            task is a verified, production-grade training example, permanently archived on the
            Sia Network. The same infrastructure also supports running benchmark evaluations.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 font-mono text-sm px-6 py-3 rounded-lg transition-all"
              style={{
                background: "var(--green)",
                color: "#0a0b0d",
                fontWeight: 600,
              }}
            >
              Get started →
            </Link>
            <Link
              href="/whitepaper"
              className="inline-flex items-center gap-2 font-mono text-sm px-6 py-3 rounded-lg transition-all"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--subtle)",
              }}
            >
              Read the whitepaper
            </Link>
          </div>
        </div>
      </section>

      {/* ── The Problem ── */}
      <section
        className="py-20"
        style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <p
            className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3"
            style={{ color: "var(--subtle)" }}
          >
            The problem
          </p>
          <h2
            className="font-mono text-2xl sm:text-3xl font-semibold mb-4"
            style={{ color: "var(--text)" }}
          >
            Data quality is an afterthought.
          </h2>
          <p
            className="font-mono text-sm leading-relaxed max-w-2xl mb-12"
            style={{ color: "var(--subtle)" }}
          >
            The field moves fast, but there's no shared standard for what makes a training example valid.
            A task with a leaked solution corrupts your training data. An ambiguous instruction produces
            unreliable model behavior. A task that's too easy or too hard tells you nothing about
            capability. The same problems that make a task a bad training example also make it a
            bad benchmark.
          </p>

          <div className="grid sm:grid-cols-3 gap-4">
            {PROBLEMS.map((p) => (
              <div
                key={p.stat}
                className="p-5 rounded-xl"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div
                  className="font-mono text-3xl font-semibold mb-1"
                  style={{ color: "var(--red)" }}
                >
                  {p.stat}
                </div>
                <div
                  className="font-mono text-xs font-medium mb-2"
                  style={{ color: "var(--text)" }}
                >
                  {p.label}
                </div>
                <div
                  className="font-mono text-xs leading-relaxed"
                  style={{ color: "var(--subtle)" }}
                >
                  {p.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What it does ── */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <p
            className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3"
            style={{ color: "var(--subtle)" }}
          >
            How it works
          </p>
          <h2
            className="font-mono text-2xl sm:text-3xl font-semibold mb-4"
            style={{ color: "var(--text)" }}
          >
            Every example earns its place.
          </h2>
          <p
            className="font-mono text-sm leading-relaxed max-w-2xl mb-14"
            style={{ color: "var(--subtle)" }}
          >
            You submit a task, a realistic command-line scenario with a broken environment, an oracle
            fix, and a test suite. OpenBench runs it through 9 automated curation stages that check
            for syntactic validity, instructional quality, solvability, and calibrated difficulty.
            If it clears all of them, a human reviewer approves it and it enters the registry as a
            verified training example. Then it stays there, permanently, on the Sia Network along
            with all its datasets and artifacts. The same tasks can also be used for benchmark
            evaluations.
          </p>

          {/* Terminal mockup, the signature element */}
          <div
            className="rounded-xl overflow-hidden mb-14 log-terminal"
            style={{ border: "1px solid var(--border)" }}
          >
            {/* Terminal chrome */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
              <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
              <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
              <span
                className="ml-3 font-mono text-[11px]"
                style={{ color: "var(--subtle)" }}
              >
                openbench - pipeline curation
              </span>
            </div>

            {/* Terminal content */}
            <div className="p-5 font-mono text-xs leading-loose overflow-x-auto">
              <div style={{ color: "var(--subtle)" }}>$ openbench submit ./fix-nginx-upstream.zip</div>
              <div style={{ color: "var(--subtle)" }} className="mt-2">Task: <span style={{ color: "var(--text)" }}>fix-nginx-upstream</span></div>
              <div style={{ color: "var(--subtle)" }}>Description: <span style={{ color: "var(--text)" }}>Nginx upstream config returns 502; agent must identify and fix the misconfigured proxy_pass directive</span></div>
              <div className="mt-3" style={{ color: "var(--subtle)" }}>Running curation pipeline...</div>
              <div className="mt-2">
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [01/09] Similarity     </span>
                <span style={{ color: "var(--text)" }}>cosine=0.41 - unique enough</span>
              </div>
              <div>
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [02/09] CI Checks      </span>
                <span style={{ color: "var(--text)" }}>bash ok · python ok · docker built in 12s</span>
              </div>
              <div>
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [03/09] Quality        </span>
                <span style={{ color: "var(--text)" }}>score=0.82 across 11 criteria</span>
              </div>
              <div>
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [04/09] Preflight      </span>
                <span style={{ color: "var(--text)" }}>8 test functions collected</span>
              </div>
              <div>
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [05/09] Oracle/NOP     </span>
                <span style={{ color: "var(--text)" }}>NOP=0 ✓  Oracle=1 ✓</span>
              </div>
              <div>
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [06/09] Easiness       </span>
                <span style={{ color: "var(--text)" }}>2/5 passes (fast model) - not trivial</span>
              </div>
              <div>
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [07/09] Difficulty     </span>
                <span style={{ color: "var(--text)" }}>1/5 passes (frontier model) - genuinely hard</span>
              </div>
              <div>
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [08/09] Agent Quality  </span>
                <span style={{ color: "var(--text)" }}>instructions realistic, no leaked assertions</span>
              </div>
              <div>
                <span style={{ color: "var(--green)" }}>✓</span>
                <span style={{ color: "var(--subtle)" }}> [09/09] Sia Upload     </span>
                <span style={{ color: "var(--text)" }}>stored at baegaajais...7pq4  ·  permanent</span>
              </div>
              <div className="mt-3" style={{ color: "var(--green)" }}>
                Pipeline passed. Awaiting human approval.
              </div>
            </div>
          </div>

          {/* Pipeline stages grid */}
          <p
            className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4"
            style={{ color: "var(--subtle)" }}
          >
            9-stage curation pipeline
          </p>
          <div className="grid gap-2">
            {PIPELINE_STAGES.map((stage, i) => (
              <div
                key={stage.label}
                className="flex items-start gap-4 px-4 py-3.5 rounded-lg"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                <span
                  className="font-mono text-xs pt-0.5 tabular-nums flex-shrink-0"
                  style={{ color: "var(--subtle)", minWidth: "1.5rem" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <span className="font-mono text-sm font-medium" style={{ color: "var(--text)" }}>
                    {stage.label}
                  </span>
                  <p
                    className="font-mono text-xs mt-1 leading-relaxed"
                    style={{ color: "var(--subtle)" }}
                  >
                    {stage.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Permanence ── */}
      <section
        className="py-20"
        style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <div className="grid sm:grid-cols-2 gap-12 items-center">
            <div>
              <p
                className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3"
                style={{ color: "var(--subtle)" }}
              >
                Immutability
              </p>
              <h2
                className="font-mono text-2xl sm:text-3xl font-semibold mb-4"
                style={{ color: "var(--text)" }}
              >
                Results that can't disappear.
              </h2>
              <p
                className="font-mono text-sm leading-relaxed mb-4"
                style={{ color: "var(--subtle)" }}
              >
                Every approved task, along with all its datasets and evaluation artifacts, is uploaded
                to the Sia Network, content-addressed decentralized storage. That means no one can
                modify or delete a result after it's published. The receipt is public.
              </p>
              <p
                className="font-mono text-sm leading-relaxed"
                style={{ color: "var(--subtle)" }}
              >
                Compare that to the typical research pipeline: a Google Sheet, a GitHub repo,
                and a paper's supplemental material, any of which can be quietly updated or
                taken offline.
              </p>
            </div>
            <div
              className="rounded-xl p-6"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <p
                className="font-mono text-[10px] tracking-[0.2em] uppercase mb-4"
                style={{ color: "var(--subtle)" }}
              >
                Sia upload receipt
              </p>
              <div className="space-y-3">
                {[
                  { k: "Task ID", v: "task_9f3a2c" },
                  { k: "Content hash", v: "baegaajais...7pq4" },
                  { k: "Uploaded", v: "2026-06-18 14:32:11 UTC" },
                  { k: "Network", v: "Sia (decentralized)" },
                  { k: "Mutable", v: "No" },
                ].map((row) => (
                  <div key={row.k} className="flex justify-between items-baseline gap-4">
                    <span
                      className="font-mono text-[11px]"
                      style={{ color: "var(--subtle)" }}
                    >
                      {row.k}
                    </span>
                    <span
                      className="font-mono text-[11px] text-right"
                      style={{ color: row.k === "Mutable" ? "var(--red)" : "var(--text)" }}
                    >
                      {row.v}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <p
            className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3"
            style={{ color: "var(--subtle)" }}
          >
            Who it's for
          </p>
          <h2
            className="font-mono text-2xl sm:text-3xl font-semibold mb-10"
            style={{ color: "var(--text)" }}
          >
            Built for the people building better AI.
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                role: "Data Curators",
                desc: "You want to contribute tasks that become verified training examples for the community. Submit a task, and the pipeline certifies its quality through 9 automated stages with measurable thresholds before it enters the training data registry.",
              },
              {
                role: "AI Trainers",
                desc: "You need high-quality, verified training data to improve model performance. Every approved task is a certified training sample with documented quality scores, difficulty calibration, and proven solvability.",
              },
              {
                role: "AI Researchers",
                desc: "You need evaluation tasks that hold up under scrutiny. The curation pipeline gives you a formal audit trail for every task in your training or evaluation set.",
              },
              {
                role: "ML Engineers",
                desc: "You're training models and need confidence that your training examples aren't leaking answers or skewing difficulty. Calibration is enforced, not assumed.",
              },
              {
                role: "Lab Evaluators",
                desc: "You're comparing models across time and need verifiable training data and results. Sia storage on the decentralized network means the record is always there.",
              },

            ].map((item) => (
              <div
                key={item.role}
                className="p-5 rounded-xl"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div
                  className="font-mono text-xs font-semibold mb-3"
                  style={{ color: "var(--green)" }}
                >
                  {item.role}
                </div>
                <p
                  className="font-mono text-xs leading-relaxed"
                  style={{ color: "var(--subtle)" }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Open source / CTA ── */}
      <section
        className="py-20"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2
            className="font-mono text-2xl sm:text-3xl font-semibold mb-4"
            style={{ color: "var(--text)" }}
          >
            Open infrastructure.<br />
            <span style={{ color: "var(--green)" }}>Anyone can run it.</span>
          </h2>
          <p
            className="font-mono text-sm leading-relaxed max-w-xl mx-auto mb-3"
            style={{ color: "var(--subtle)" }}
          >
            OpenBench is open source. You can self-host the full data curation stack: frontend, backend, pipeline
            engine, and Sia integration with a single{" "}
            <code
              className="px-1.5 py-0.5 rounded text-[11px]"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              docker compose up
            </code>
            .
          </p>
          <p
            className="font-mono text-sm leading-relaxed max-w-2xl mx-auto mb-10"
            style={{ color: "var(--subtle)" }}
          >
            Tasks are reproducible, shareable, and forkable as both training data and benchmarks. Every
            task that passes curation, every dataset it depends on, and every result that's generated
            can be independently verified by any third party by fetching the corresponding artifacts
            from the Sia Network. That's the point.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 font-mono text-sm px-6 py-3 rounded-lg transition-all"
              style={{
                background: "var(--green)",
                color: "#0a0b0d",
                fontWeight: 600,
              }}
            >
              Start contributing tasks →
            </Link>
            <Link
              href="/whitepaper"
              className="inline-flex items-center gap-2 font-mono text-sm px-6 py-3 rounded-lg transition-all"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--subtle)",
              }}
            >
              Technical whitepaper
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        className="py-8 px-6"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span
            className="font-mono text-[11px]"
            style={{ color: "var(--subtle)" }}
          >
            OpenBench - an AI dataset curation and evaluation platform for AI model trainings
          </span>
          <div className="flex items-center gap-6">
            <Link
              href="/whitepaper"
              className="font-mono text-[11px] transition-colors"
              style={{ color: "var(--subtle)" }}
            >
              Whitepaper
            </Link>
            <Link
              href="/login"
              className="font-mono text-[11px] transition-colors"
              style={{ color: "var(--subtle)" }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>

    </div>
  );
}