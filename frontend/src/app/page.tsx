import Link from "next/link";
import { ArrowRight, GitBranch, Cpu, Database, Shield } from "lucide-react";

const FEATURES = [
  {
    icon: Shield,
    label: "5-Stage Curation",
    desc: "Every task passes similarity, CI, quality, easiness, and agent quality checks before entering the registry.",
    color: "var(--green)",
  },
  {
    icon: Cpu,
    label: "Multi-Model Runner",
    desc: "Run approved benchmarks against Llama3, Claude, DeepSeek, or any pluggable adapter — in isolated Docker containers.",
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
    desc: "Approved tasks indexed via Sia Indexd. Reproducible, shareable, forkable.",
    color: "var(--cyan)",
  },
];

const PIPELINE_STAGES = [
  { n: "01", label: "Similarity & Diversity",     desc: "cosine > 0.85 → rejected" },
  { n: "02", label: "CI Checks",                  desc: "container smoke test" },
  { n: "03", label: "Quality Check",              desc: "5-criteria LLM score ≥ 0.6" },
  { n: "04", label: "Easiness Prefilter",          desc: "llama3 can't solve it" },
  { n: "05", label: "Agent Quality Check",         desc: "benchmark designer verdict" },
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
            Open infrastructure for reproducible AI benchmark curation and evaluation.
          </p>
          <p className="mb-10 text-sm" style={{ color: "var(--subtle)", maxWidth: "480px", lineHeight: 1.7 }}>
            Submit tasks through a 5-stage quality pipeline. Run approved benchmarks against any AI model.
            Results stored on Sia Network, indexed via Sia Indexd.
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

      {/* Pipeline stages strip */}
      <section
        className="border-y"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="section-label mb-4">Curation Pipeline</div>
          <div className="flex gap-0 overflow-x-auto">
            {PIPELINE_STAGES.map((s, i) => (
              <div
                key={s.n}
                className="flex-1 min-w-[160px] border-r last:border-r-0 pr-6 pl-4 first:pl-0 py-2"
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
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="section-label mb-8">What it does</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map(({ icon: Icon, label, desc, color }) => (
            <div
              key={label}
              className="bench-card rounded-lg p-6"
            >
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

      {/* Stack */}
      <section
        className="border-t"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="section-label mb-4">Stack</div>
          <div className="flex flex-wrap gap-2">
            {[
              "Next.js 15", "TypeScript", "TailwindCSS", "Prisma + SQLite",
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
