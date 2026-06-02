import Link from "next/link";
import { ArrowRight, GitBranch, Cpu, Database, Shield, Terminal, CheckCircle } from "lucide-react";

const FEATURES = [
  {
    icon: Terminal,
    label: "Terminal-Native Tasks",
    desc: "Broken builds, misconfigured services, failing pipelines — realistic scenarios an AI agent must solve entirely through the command line.",
    color: "var(--green)",
  },
  {
    icon: CheckCircle,
    label: "Programmatic Verification",
    desc: "Every task has a test suite and an oracle solution. The verifier writes the result — no self-reporting, no vibes-based scoring.",
    color: "var(--blue)",
  },
  {
    icon: Database,
    label: "Sia Network Storage",
    desc: "Every result artifact uploaded to Sia Network. Immutable, content-addressed, publicly verifiable.",
    color: "var(--amber)",
  },
  {
    icon: GitBranch,
    label: "Open Registry",
    desc: "Approved tasks indexed via Sia Indexd. Reproducible, shareable, forkable — anyone can run the same benchmark and verify the result.",
    color: "var(--cyan)",
  },
];

const PIPELINE_STAGES = [
  { n: "01", label: "Similarity & Diversity", desc: "cosine > 0.85 → rejected" },
  { n: "02", label: "CI Checks", desc: "syntax, dockerfile, file invariants" },
  { n: "03", label: "NOP & Oracle", desc: "tests fail before, pass after solve.sh" },
  { n: "04", label: "Difficulty Probe", desc: "agent runs ×5, must land 1–3 passes" },
  { n: "05", label: "Human Review", desc: "final pass before registry" },
];

const STATS = [
  { val: "1–3/5", label: "Target difficulty — passes out of 5 probe runs" },
  { val: "5", label: "Pipeline stages every task must clear" },
  { val: "≥6", label: "Pytest functions required per task" },
  { val: "100%", label: "Results verifiable on Sia Network" },
];

export default function Home() {
  return (
    <div className="grid-bg min-h-screen">

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded mb-8 border section-label"
            style={{ borderColor: "rgba(0,230,118,0.3)", background: "rgba(0,230,118,0.06)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--green)" }} />
            <span style={{ color: "var(--green)" }}>MVP · Local Dev</span>
          </div>

          {/* Headline */}
          <h1
            className="font-display font-bold leading-none mb-6"
            style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)", color: "var(--text)" }}
          >
            OPEN
            <br />
            <span style={{ color: "var(--green)" }} className="text-glow-green">
              BENCH
            </span>
          </h1>

          <p className="text-lg mb-3" style={{ color: "var(--text)", maxWidth: "540px", lineHeight: 1.6 }}>
            Benchmark tasks for terminal AI agents. Built in the open.
          </p>
          <p className="mb-10 text-sm" style={{ color: "var(--subtle)", maxWidth: "500px", lineHeight: 1.7 }}>
            Each task is a realistic command-line challenge — a broken build, a failing service, a bad config.
            Agents solve it. Tests verify it. Results live on Sia Network forever.
          </p>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="bench-btn-primary flex items-center gap-2 px-5 py-2.5 rounded text-sm"
            >
              Open Dashboard
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/tasks/submit"
              className="bench-btn-ghost flex items-center gap-2 px-5 py-2.5 rounded text-sm"
            >
              Submit a Task
            </Link>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section
        className="border-y"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex gap-0 overflow-x-auto">
            {STATS.map((s, i) => (
              <div
                key={s.val}
                className="flex-1 min-w-[160px] border-r last:border-r-0 pr-6 pl-4 first:pl-0 py-2"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="font-mono font-semibold text-xl mb-1"
                  style={{ color: "var(--green)" }}
                >
                  {s.val}
                </div>
                <div className="text-xs" style={{ color: "var(--subtle)", lineHeight: 1.5 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What is a benchmark task */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-10">
        <div className="section-label mb-6">What's a benchmark task?</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--subtle)" }}>
              A benchmark task is a realistic, verifiable computer problem — the kind of thing an engineer
              actually runs into. A build that won't compile. A service that won't start. A data pipeline
              producing wrong output. The agent gets a terminal and has to fix it.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--subtle)" }}>
              Tasks can't be too easy (agents already nail them) or too hard (agents never meaningfully attempt
              them). The target is 1–3 out of 5 agent runs passing — hard enough to be signal, approachable
              enough to be useful.
            </p>
          </div>
          <div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--subtle)" }}>
              Every task ships with a test suite and an oracle solution. Tests must fail in the broken
              environment and pass after the fix is applied. The verifier writes a reward to{" "}
              <code
                className="font-mono text-xs px-1.5 py-0.5 rounded"
                style={{ background: "var(--muted)", color: "var(--text)" }}
              >
                /logs/verifier/reward.txt
              </code>{" "}
              — that's it. No self-reporting.
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--subtle)" }}>
              Domains include software engineering, sysadmin, security, scientific computing, and anything
              else that's challenging, realistic, and verifiable through the command line.
            </p>
          </div>
        </div>
      </section>

      {/* Pipeline stages strip */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        <div className="section-label mb-4">Curation Pipeline</div>
        <div
          className="flex gap-0 overflow-x-auto border rounded-lg"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {PIPELINE_STAGES.map((s) => (
            <div
              key={s.n}
              className="flex-1 min-w-[160px] border-r last:border-r-0 px-5 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="font-mono text-xs mb-1" style={{ color: "var(--subtle)" }}>
                {s.n}
              </div>
              <div className="text-sm font-medium mb-0.5" style={{ color: "var(--text)" }}>
                {s.label}
              </div>
              <div className="font-mono text-xs" style={{ color: "var(--subtle)" }}>
                {s.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-6xl mx-auto px-6 py-10">
        <div className="section-label mb-8">What it does</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map(({ icon: Icon, label, desc, color }) => (
            <div key={label} className="bench-card rounded-lg p-6">
              <div
                className="w-8 h-8 rounded flex items-center justify-center mb-4"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <h3 className="font-mono font-semibold text-sm mb-2" style={{ color: "var(--text)" }}>
                {label}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--subtle)" }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — two columns */}
      <section
        className="border-t border-b"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="section-label mb-8">How it works</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">

            {/* Authoring */}
            <div>
              <p className="text-sm font-medium mb-6" style={{ color: "var(--text)" }}>
                Authoring a task
              </p>
              {[
                { n: "1", title: "Write a realistic scenario", body: "Describe the broken state naturally in instruction.md — like explaining it to a teammate, not a test spec." },
                { n: "2", title: "Write the oracle solution", body: "solve.sh applies the actual fix. Tests must fail before it runs, and pass cleanly after." },
                { n: "3", title: "Package and submit", body: "Zip the task folder and upload via the dashboard. The pipeline runs automatically and tells you exactly what to fix if anything fails." },
              ].map((step) => (
                <div key={step.n} className="flex gap-4 mb-6 last:mb-0">
                  <div
                    className="font-mono text-xs w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border"
                    style={{ color: "var(--subtle)", borderColor: "var(--border)", background: "var(--muted)" }}
                  >
                    {step.n}
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: "var(--text)" }}>{step.title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--subtle)" }}>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Running */}
            <div>
              <p className="text-sm font-medium mb-6" style={{ color: "var(--text)" }}>
                Running a benchmark
              </p>
              {[
                { n: "1", title: "Pick tasks from the registry", body: "Approved tasks are indexed via Sia Indexd — reproducible and forkable by anyone." },
                { n: "2", title: "Run against any model", body: "Pluggable adapters for Llama 3, Claude, DeepSeek, or your own — each run isolated in Docker." },
                { n: "3", title: "Results on Sia Network", body: "Every result artifact is content-addressed and immutable. Anyone can verify what happened, when, and how." },
              ].map((step) => (
                <div key={step.n} className="flex gap-4 mb-6 last:mb-0">
                  <div
                    className="font-mono text-xs w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border"
                    style={{ color: "var(--subtle)", borderColor: "var(--border)", background: "var(--muted)" }}
                  >
                    {step.n}
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1" style={{ color: "var(--text)" }}>{step.title}</p>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--subtle)" }}>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* Stack */}
      <section
        className="border-t"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="section-label mb-4">Stack</div>
          <div className="flex flex-wrap gap-2">
            {[
              "Next.js 16", "TypeScript", "TailwindCSS", "Prisma + SQLite",
              "Inngest", "Dockerode", "Ollama", "Anthropic SDK", "DeepSeek",
              "Sia Network", "Sia Indexd", "Turborepo",
            ].map((t) => (
              <span
                key={t}
                className="font-mono text-xs px-2.5 py-1 rounded"
                style={{
                  background: "var(--muted)",
                  color: "var(--subtle)",
                  border: "1px solid var(--border)",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}