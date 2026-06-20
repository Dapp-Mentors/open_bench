// src/app/whitepaper/page.tsx
//
// OpenBench technical whitepaper - public, no auth required.

import Link from "next/link";

export const metadata = {
    title: "Whitepaper - OpenBench",
    description: "Technical architecture, design goals, and research rationale behind OpenBench.",
};

function Section({ id, eyebrow, title, children }: {
    id: string;
    eyebrow: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section id={id} className="py-16" style={{ borderTop: "1px solid var(--border)" }}>
            <p
                className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3"
                style={{ color: "var(--subtle)" }}
            >
                {eyebrow}
            </p>
            <h2
                className="font-mono text-xl sm:text-2xl font-semibold mb-6"
                style={{ color: "var(--text)" }}
            >
                {title}
            </h2>
            <div
                className="font-mono text-sm leading-relaxed space-y-4 max-w-2xl"
                style={{ color: "var(--subtle)" }}
            >
                {children}
            </div>
        </section>
    );
}

function Code({ children }: { children: React.ReactNode }) {
    return (
        <code
            className="px-1.5 py-0.5 rounded text-[11px]"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
            {children}
        </code>
    );
}

function DataRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="flex justify-between items-center gap-4 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="font-mono text-xs flex-shrink-0" style={{ color: "var(--subtle)" }}>{label}</span>
            <span className="font-mono text-xs text-right" style={{ color: accent ? "var(--green)" : "var(--text)" }}>{value}</span>
        </div>
    );
}

export default function Whitepaper() {
    return (
        <div style={{ background: "var(--bg)", color: "var(--text)" }}>

            {/* ── Header ── */}
            <div
                className="pt-14 pb-20 px-6"
                style={{ borderBottom: "1px solid var(--border)" }}
            >
                <div className="max-w-3xl mx-auto">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 font-mono text-[11px] transition-colors"
                        style={{ color: "var(--subtle)" }}
                    >
                        ← Back to OpenBench
                    </Link>

                    <div className="mt-10 mb-6">
                        <div
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[10px] tracking-widest uppercase"
                            style={{
                                background: "rgba(0,230,118,0.05)",
                                border: "1px solid rgba(0,230,118,0.15)",
                                color: "var(--subtle)",
                            }}
                        >
                            Technical Document · v0.1
                        </div>
                    </div>

                    <h1
                        className="font-mono text-3xl sm:text-4xl font-semibold mb-4"
                        style={{ color: "var(--text)", letterSpacing: "-0.02em" }}
                    >
                        OpenBench: Open Infrastructure<br />
                        for AI Training Data Curation & Evaluation
                    </h1>

                    <p
                        className="font-mono text-sm leading-relaxed max-w-xl"
                        style={{ color: "var(--subtle)" }}
                    >
                        A technical overview of the design, architecture, and goals of the OpenBench platform,
                        including the data curation pipeline, multi-agent quality assurance system, and decentralized storage model.
                    </p>

                    {/* TOC */}
                    <div
                        className="mt-10 p-5 rounded-xl"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                        <p
                            className="font-mono text-[10px] tracking-[0.2em] uppercase mb-4"
                            style={{ color: "var(--subtle)" }}
                        >
                            Contents
                        </p>
                        <div className="space-y-2">
                            {[
                                ["01", "Abstract", "#abstract"],
                                ["02", "Motivation & Prior Work", "#motivation"],
                                ["03", "System Architecture", "#architecture"],
                                ["04", "The Curation Pipeline", "#pipeline"],
                                ["05", "Multi-Agent Calibration (Stages 6 & 7)", "#calibration"],
                                ["06", "Decentralized Storage & Verifiability", "#storage"],
                                ["07", "Task Format Specification", "#task-format"],
                                ["08", "Project Goals", "#goals"],
                                ["09", "Current Status & Limitations", "#status"],
                                ["10", "Future Plans", "#roadmap"],
                            ].map(([num, label, href]) => (
                                <a
                                    key={href}
                                    href={href}
                                    className="flex items-center gap-3 font-mono text-xs transition-colors"
                                    style={{ color: "var(--subtle)", textDecoration: "none" }}
                                >
                                    <span style={{ color: "var(--muted)" }}>{num}</span>
                                    {label}
                                </a>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="max-w-3xl mx-auto px-6">

                <Section id="abstract" eyebrow="§01" title="Abstract">
                    <p>
                        OpenBench is an open-source platform for curating, validating, and producing
                        high-quality AI training datasets. The core claim is simple: a training example should not
                        reach a dataset registry unless it has been formally verified to be syntactically
                        valid, semantically meaningful, correctly calibrated for difficulty, and permanently
                        archived in a form that anyone can independently verify.
                    </p>
                    <p>
                        The platform implements this through a 9-stage automated curation pipeline that accepts
                        task submissions as ZIP archives and rejects anything that doesn't meet explicit,
                        measurable thresholds. Tasks that pass the pipeline, along with all their associated datasets
                        and artifacts, are uploaded to the Sia Network, a decentralized storage layer,
                        where they become content-addressed and immutable. Each approved task is a verified,
                        production-grade training example ready for use in model training pipelines, and the
                        same infrastructure also supports running benchmark evaluations against those tasks.
                    </p>
                    <p>
                        The system is built for AI trainers who need verified training examples, data curators
                        who want to contribute quality tasks to the community, and researchers and engineers
                        who need evaluation infrastructure they can trust, audit, and run themselves.
                    </p>
                </Section>

                <Section id="motivation" eyebrow="§02" title="Motivation & Prior Work">
                    <p>
                        The quality of training data is the single biggest factor in AI model performance,
                        yet most datasets are assembled without rigorous quality checks. Task leakage,
                        ambiguous instructions, miscalibrated difficulty, and syntactically broken examples
                        all degrade training quality. When a dataset is updated, there's often no public
                        record of what changed and no way to verify the provenance of individual examples.
                    </p>
                    <p>
                        The same problems plague AI benchmarking. Leaderboard contamination, inconsistent
                        evaluation protocols, and unverifiable results make it difficult to draw reliable
                        conclusions. Most evaluation frameworks don't enforce formal quality checks on
                        individual tasks, and curation is usually a manual process with unpublished criteria.
                    </p>
                    <p>
                        OpenBench solves both problems with a single pipeline. The 9-stage curation process
                        treats every submitted task as a candidate training example and applies automated
                        quality gates at each stage. A task that survives the full pipeline has been
                        validated for syntactic correctness, scored for instructional quality across
                        11 criteria, proven to have a deterministic solution via the Oracle/NOP contract,
                        calibrated for difficulty through multi-agent probing, and checked for clarity
                        and actionability from an agent's perspective. The result is a training example
                        whose quality is formally documented, not assumed.
                    </p>
                    <p>
                        The specific focus on command-line, terminal-based tasks reflects a practical
                        reality: agentic AI systems are increasingly deployed in environments where
                        they interact with shells, build tools, and services. Training data for these
                        scenarios requires tasks that can actually be executed and verified
                        programmatically, not multiple-choice questions or natural language outputs
                        that require human judgment to score. The same characteristics that make a
                        task a good training example also make it a valid benchmark.
                    </p>
                </Section>

                <Section id="architecture" eyebrow="§03" title="System Architecture">
                    <p>
                        OpenBench runs as a 6-service Docker stack. The frontend is a Next.js application
                        with a role-based access control system. The backend is a FastAPI service that owns
                        the pipeline execution logic. Pipeline stages run as durable Inngest functions,
                        which means they survive crashes and can resume mid-pipeline without losing state.
                    </p>

                    {/* Stack table */}
                    <div
                        className="rounded-xl overflow-hidden mt-4"
                        style={{ border: "1px solid var(--border)" }}
                    >
                        {[
                            ["Frontend", "Next.js 16, TypeScript, TailwindCSS"],
                            ["Backend", "Python, FastAPI, SQLAlchemy, PostgreSQL"],
                            ["Event Pipeline", "Inngest (durable functions over HTTP)"],
                            ["Embeddings", "Ollama - nomic-embed-text (local)"],
                            ["LLM Provider", "OpenRouter (DeepSeek, Claude, GPT, Gemini, Llama)"],
                            ["Multi-Agent", "CrewAI (sequential: Analyst → Architect → Implementer → Verifier)"],
                            ["Storage", "Sia Network via SDK & Indexer"],
                            ["Auth", "NextAuth.js with WebAuthn / Passkey"],
                            ["Containerization", "Docker (sibling containers on host daemon)"],
                        ].map(([layer, tech]) => (
                            <DataRow key={layer} label={layer} value={tech} />
                        ))}
                    </div>

                    <p className="mt-4">
                        Container execution uses the host Docker socket. Benchmark tasks run in sibling
                        containers (not children of the backend container), which keeps resource isolation
                        clean and lets the backend manage container lifecycle without privileged access
                        beyond the socket mount.
                    </p>
                    <p>
                        Two watchdog cron processes run alongside the main pipeline. A pipeline watchdog
                        fires every 5 minutes and detects tasks stuck in <Code>pipeline_running</Code> for
                        longer than 30 minutes; it re-queues orphaned runs and force-rejects tasks that
                        have been running for more than 2 hours. A cleanup watchdog fires hourly and removes
                        local ZIP files, extracted directories, and Docker images for tasks rejected more
                        than 24 hours ago.
                    </p>
                </Section>

                <Section id="pipeline" eyebrow="§04" title="The Curation Pipeline">
                    <p>
                        Every task submission triggers a 9-stage sequential pipeline. Stages run via Inngest
                        functions, each of which calls a dedicated endpoint on the backend. If any stage
                        fails, the task is marked <Code>rejected</Code> and the pipeline halts with a reason
                        string. All stage output is stored in <Code>PipelineLog</Code> in the database and
                        is visible in the admin dashboard.
                    </p>

                    <div className="space-y-3 mt-4">
                        {[
                            {
                                n: "01", name: "Similarity & Diversity",
                                detail: "Generates an embedding of the task instruction using nomic-embed-text (running locally via Ollama) and computes cosine similarity against all approved tasks in the registry. Tasks with cosine > 0.85 against any existing task are rejected. This prevents benchmark contamination through near-duplicate submissions.",
                                threshold: "cosine ≤ 0.85"
                            },
                            {
                                n: "02", name: "CI Checks",
                                detail: "Validates bash script syntax, attempts Python compilation on all .py files in the task directory, and runs docker build on the provided Dockerfile. Any failure at this stage indicates the task can't be executed at all. There's no point continuing.",
                                threshold: "All green"
                            },
                            {
                                n: "03", name: "Quality Assessment",
                                detail: "An LLM-as-judge evaluates the task instruction across 11 criteria: realism, clarity, specificity, verifiability, difficulty appropriateness, completeness, actionability, non-ambiguity, domain relevance, instruction length, and absence of hints. Each criterion scores 0–1; the average must reach ≥ 0.6.",
                                threshold: "Average score ≥ 0.6"
                            },
                            {
                                n: "04", name: "Preflight",
                                detail: "Runs pytest --collect-only inside the built Docker image to verify that the test suite is structured correctly and contains enough test functions. At least 6 functions are required. This catches tasks where the test file exists but is effectively empty or malformed.",
                                threshold: "≥ 6 test functions"
                            },
                            {
                                n: "05", name: "Oracle / NOP Contract",
                                detail: "Runs two separate containers. The NOP container executes only the test suite against the broken environment. Reward must be 0. The Oracle container runs solve.sh first, then the test suite. Reward must be 1. Both must hold, or the task is rejected. This enforces a formal contract: the environment must actually be broken, and the oracle fix must actually fix it.",
                                threshold: "NOP=0 AND Oracle=1"
                            },
                            {
                                n: "06", name: "Easiness Probe",
                                detail: "A CrewAI multi-agent probe (Task Analyst → Solution Architect → Code Implementer → Test Verifier) runs 5 parallel attempts using a fast, inexpensive model (configured as the easiness model in admin settings). Runs stagger 12 seconds apart to avoid rate-limit collisions. Early-exit cancels remaining runs the moment the outcome is clear. Target: 1–4 out of 5 passing. 0/5 means the task is too hard even for the fast probe; 5/5 means it's trivially easy.",
                                threshold: "1–4 / 5 passing"
                            },
                            {
                                n: "07", name: "Difficulty Probe",
                                detail: "Same probe infrastructure, same 5-run staggered parallel setup, but now using the frontier model. Target: 1–3 out of 5 passing. A task where the strongest available model passes every run isn't a useful benchmark; a task where it fails every run might be misconfigured. This stage calibrates difficulty relative to the current frontier.",
                                threshold: "1–3 / 5 passing"
                            },
                            {
                                n: "08", name: "Agent Quality",
                                detail: "A second LLM-as-judge pass focused specifically on the task from an agent's perspective: are the instructions realistic for a terminal-based agent? Are any assertions or test details accidentally visible in the instruction text? Is the task actually actionable given the environment described? Must score ≥ 70%.",
                                threshold: "≥ 70%"
                            },
                            {
                                n: "09", name: "Sia Upload",
                                detail: "The task ZIP and metadata are uploaded to Sia Network. The resulting content hash (a CID) is stored in the database and displayed in the admin panel. This stage is non-fatal. If the upload fails (e.g. Sia is temporarily unreachable), the task is still marked pipeline_passed but the siaStatus field reflects the failure so admins can retry. In demo mode, uploads are simulated with realistic delays.",
                                threshold: "Upload succeeds"
                            },
                        ].map((stage) => (
                            <div
                                key={stage.n}
                                className="p-4 rounded-lg"
                                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                            >
                                <div className="flex items-center justify-between gap-4 mb-2">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="font-mono text-xs tabular-nums"
                                            style={{ color: "var(--subtle)" }}
                                        >
                                            {stage.n}
                                        </span>
                                        <span
                                            className="font-mono text-sm font-medium"
                                            style={{ color: "var(--text)" }}
                                        >
                                            {stage.name}
                                        </span>
                                    </div>
                                    <span
                                        className="font-mono text-[10px] px-2 py-0.5 rounded flex-shrink-0"
                                        style={{
                                            background: "rgba(0,230,118,0.08)",
                                            border: "1px solid rgba(0,230,118,0.2)",
                                            color: "var(--green)",
                                        }}
                                    >
                                        {stage.threshold}
                                    </span>
                                </div>
                                <p
                                    className="font-mono text-xs leading-relaxed"
                                    style={{ color: "var(--subtle)" }}
                                >
                                    {stage.detail}
                                </p>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section id="calibration" eyebrow="§05" title="Multi-Agent Calibration (Stages 6 & 7)">
                    <p>
                        The difficulty calibration stages use a CrewAI multi-agent pipeline instead of a
                        single-shot prompt. This is a deliberate design choice. A single prompt to an LLM
                        asking "can you solve this task?" produces unreliable results. The model might
                        describe a solution without actually executing commands, or fail for reasons unrelated
                        to the task's actual difficulty.
                    </p>
                    <p>
                        Instead, each probe attempt runs four agents in sequence:
                    </p>
                    <div
                        className="p-4 rounded-lg mt-1"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                    >
                        <div className="space-y-3">
                            {[
                                ["Task Analyst", "Reads the instruction, Dockerfile, and test structure. Produces an analysis of what's broken and what a fix would require."],
                                ["Solution Architect", "Plans the fix in concrete terms, specific commands, file edits, config changes, based on the analyst's output."],
                                ["Code Implementer", "Executes the plan via shell commands in the container. This is where actual work happens."],
                                ["Test Verifier", "Runs the test suite and reports the result. The pass/fail verdict from this agent determines whether the attempt counts as passing."],
                            ].map(([name, desc]) => (
                                <div key={name} className="flex gap-3">
                                    <span
                                        className="font-mono text-[11px] font-medium flex-shrink-0 mt-0.5"
                                        style={{ color: "var(--green)", minWidth: "120px" }}
                                    >
                                        {name}
                                    </span>
                                    <span
                                        className="font-mono text-xs leading-relaxed"
                                        style={{ color: "var(--subtle)" }}
                                    >
                                        {desc}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="mt-2">
                        Five attempts run in parallel with 12-second staggered starts. Per-task asyncio
                        locks prevent concurrent pipeline calls from double-spending API quota. Early-exit
                        logic fires the moment the outcome is statistically determined. For Stage 6,
                        that's the moment 1 pass + 1 fail is confirmed, or all 5 attempts are in.
                    </p>
                    <p>
                        Stage 6 uses the easiness model (a fast, inexpensive model configured in admin settings).
                        Stage 7 uses the frontier model (the strongest available). The intention is that a good
                        benchmark task should be solvable by the strong model sometimes but not always. If the
                        frontier model passes every run, the task isn't worth including.
                    </p>
                    <p>
                        All model calls go through OpenRouter, which provides access to hundreds of models
                        (DeepSeek, Claude, GPT, Gemini, Llama, and others) through a single API key. This
                        means the easiness and frontier model designations can be updated in the admin dashboard
                        as the field evolves without changing any code. Using a single provider avoids the
                        technical debt of building and maintaining separate integration modules for each LLM,
                        and lets us swap between frontier models like Claude Opus, GPT, DeepSeek, or Grok
                        from the UI with no backend changes.
                    </p>
                </Section>

                <Section id="storage" eyebrow="§06" title="Decentralized Storage & Verifiability">
                    <p>
                        The core trust claim of OpenBench depends on immutability: once a task is approved
                        and a benchmark result is generated, neither should be modifiable by any party,
                        including the platform operator.
                    </p>
                    <p>
                        The Sia Network provides content-addressed storage on a decentralized network of
                        storage providers. Every task dataset, benchmark artifact, and evaluation result
                        is stored here. When a file is uploaded, it returns a CID (content identifier)
                        that is derived directly from the file's content. If the file changes, the CID changes.
                        If you have a CID, you can retrieve the file from the network and verify that its hash
                        matches without trusting the platform that gave you the CID.
                    </p>
                    <p>
                        OpenBench stores the CID for every uploaded task and every benchmark result in its
                        database. Users can independently verify any result by fetching the corresponding
                        artifact by CID from the Sia Network directly.
                    </p>
                    <p>
                        The Sia integration uses a one-time browser approval flow on first boot. The backend
                        derives and stores an App Key after approval; subsequent restarts reuse it automatically.
                        If Sia is unreachable, the backend enters demo mode. Uploads are simulated and the
                        UI displays a mode badge. The evaluation pipeline runs identically in demo mode. Only
                        the permanence guarantee is absent.
                    </p>
                    <p>
                        Recovery phrase: on first boot, the backend auto-generates a BIP-39 recovery phrase
                        and writes it to <Code>phrase.enc</Code> in the data directory. In a production deployment
                        this should be replaced with a user-provided phrase and never stored on disk.
                    </p>
                </Section>

                <Section id="task-format" eyebrow="§07" title="Task Format Specification">
                    <p>
                        Each task is submitted as a ZIP archive with a fixed directory structure. This
                        structure is enforced at Stage 2 (CI Checks).
                    </p>

                    <div
                        className="rounded-xl overflow-hidden log-terminal mt-2"
                        style={{ border: "1px solid var(--border)" }}
                    >
                        <div
                            className="px-4 py-2 font-mono text-[10px] tracking-widest uppercase"
                            style={{ borderBottom: "1px solid var(--border)", color: "var(--subtle)", background: "rgba(255,255,255,0.02)" }}
                        >
                            Task archive structure
                        </div>
                        <pre
                            className="p-5 font-mono text-xs leading-loose overflow-x-auto"
                            style={{ color: "var(--subtle)", margin: 0 }}
                        >
                            {`task-name/
├── instruction.md       # The problem description
├── task.toml            # Metadata: working_dir, network_required, test_runner
├── environment/
│   └── Dockerfile       # The broken environment
├── solution/
│   └── solve.sh         # The oracle fix
└── tests/
    ├── test.sh          # Test harness entrypoint
    └── test_*.py        # Test functions (≥ 6 required)`}
                        </pre>
                    </div>

                    <p className="mt-4">
                        The critical contract is in <Code>test.sh</Code>: it must write a reward value to
                        <Code>$REWARD_FILE</Code> (injected as <Code>/logs/verifier/reward.txt</Code>).
                        In a NOP run (no solution applied), the reward must be <Code>0</Code>. In an Oracle run
                        (after <Code>solve.sh</Code> runs), the reward must be <Code>1</Code>. This is checked
                        at Stage 5 and enforced strictly. The verifier writes the result, never the task author.
                    </p>
                    <p>
                        The <Code>instruction.md</Code> should read like you're describing a problem to a
                        teammate who has access to the same terminal. It should not contain hints about what
                        the fix is, should not reference test file names or function names, and should describe
                        observable symptoms rather than root causes. Stage 8 (Agent Quality) will flag instructions
                        that leak assertions or sound like a puzzle description rather than a real work scenario.
                    </p>
                </Section>

                <Section id="goals" eyebrow="§08" title="Project Goals">
                    <p>
                        OpenBench's goals in approximate priority order:
                    </p>
                    <div className="space-y-3 mt-2">
                        {[
                            ["Make reproducibility the default", "A researcher should be able to take any task ID, fetch its archive and all associated datasets from Sia by CID, and reproduce any benchmark result without asking anyone for access or clarification."],
                            ["Formalize task quality", "The 9-stage pipeline should be a published, versioned standard, not a black box. Every threshold should be documented and debatable. The system should be open to community input on what the criteria should be."],
                            ["Eliminate low-quality task leakage", "The Oracle/NOP contract and the multi-agent calibration stages exist specifically to catch tasks that seem valid but aren't, tasks where the environment isn't actually broken, where the oracle doesn't actually fix it, or where the difficulty is so miscalibrated it tells you nothing about model capability."],
                            ["Support any model through OpenRouter", "Calibration should reflect the current state of the field, not a fixed set of models. Using OpenRouter as the sole provider means any new model is immediately available as the frontier model or easiness model."],
                            ["Self-hostable by design", "A platform that requires trusting a central operator defeats the purpose. The full stack should run locally with docker compose up, and everything a central deployment does should be reproducible by anyone."],
                            ["Produce training-grade datasets", "Tasks that pass the pipeline are not just benchmarks. They are verified, calibrated, and immutably archived training examples. Researchers should be able to pull any approved task from Sia and use it directly as a training sample, confident that it meets documented quality standards."],
                        ].map(([title, desc]) => (
                            <div
                                key={title}
                                className="p-4 rounded-lg"
                                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                            >
                                <div
                                    className="font-mono text-xs font-medium mb-2"
                                    style={{ color: "var(--text)" }}
                                >
                                    {title}
                                </div>
                                <p
                                    className="font-mono text-xs leading-relaxed"
                                    style={{ color: "var(--subtle)" }}
                                >
                                    {desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section id="status" eyebrow="§09" title="Current Status & Limitations">
                    <p>
                        OpenBench is in active development. The core pipeline is functional. The following
                        are known gaps and open questions:
                    </p>
                    <div className="space-y-2 mt-2">
                        {[
                            ["Demo mode permanence", "In demo mode (Sia unreachable), the permanence guarantee doesn't hold. Tasks and results are stored in the local database only. This is acceptable for development but not for a public deployment."],
                            ["BIP-39 phrase storage", "The current implementation stores the auto-generated recovery phrase on disk, which is a security risk in production. Future versions should prompt the operator for their own phrase."],
                            ["OpenRouter dependency", "All LLM calls go through OpenRouter. If OpenRouter has an outage, the quality assessment and calibration stages can't complete. A fallback provider layer is on the roadmap."],
                            ["Human approval bottleneck", "After the pipeline passes, a human reviewer must approve the task for the registry. This is intentional as a quality gate, but it introduces latency. Tooling to make the review process faster is a near-term priority."],
                            ["Benchmark type coverage", "The current task format is optimized for terminal-based software engineering challenges. Extending the format to support other benchmark types, including General Knowledge, Mathematical Reasoning, Multimodal, Long-Context & Retrieval, Safety & Alignment, Instruction Following, Domain-Specific, Creative & Open-Ended, and Efficiency & Deployment, requires design work for each category."],
                            ["Scale testing", "The pipeline has been tested with individual tasks and small batches. Behavior under high submission volume (many concurrent pipeline runs, many parallel CrewAI probes) hasn't been formally characterized."],
                        ].map(([title, desc]) => (
                            <div
                                key={title}
                                className="flex gap-3 py-3"
                                style={{ borderBottom: "1px solid var(--border)" }}
                            >
                                <span
                                    className="font-mono text-[11px] font-medium flex-shrink-0 mt-0.5"
                                    style={{ color: "var(--amber)", minWidth: "180px" }}
                                >
                                    {title}
                                </span>
                                <span
                                    className="font-mono text-xs leading-relaxed"
                                    style={{ color: "var(--subtle)" }}
                                >
                                    {desc}
                                </span>
                            </div>
                        ))}
                    </div>
                </Section>

                <Section id="roadmap" eyebrow="§10" title="Future Plans">
                    <p>
                        After the initial launch milestone, the focus will shift to broadening the
                        types of benchmarks the platform supports. The current terminal-based format
                        is well suited for software engineering tasks, but the evaluation infrastructure
                        is designed to be extensible. Every new benchmark category will follow the same
                        storage model: all task datasets, evaluation artifacts, and results will be
                        permanently archived on the Sia Network. The following categories are planned:
                    </p>
                    <div className="space-y-2 mt-2">
                        {[
                            ["General Knowledge", "Tasks that test a model's breadth of factual knowledge across domains, with verifiable answer keys."],
                            ["Mathematical Reasoning", "Multi-step math problems, proofs, and quantitative reasoning tasks with deterministic grading."],
                            ["Multimodal", "Tasks combining images, code, and text inputs that require understanding across modalities."],
                            ["Agentic & Tool Use", "Tasks requiring agents to interact with APIs, databases, browsers, and other external tools to accomplish goals."],
                            ["Long-Context & Retrieval", "Tasks that test a model's ability to handle large contexts, retrieve relevant information, and reason across long documents."],
                            ["Safety & Alignment", "Red-teaming, prompt injection detection, and alignment evaluation tasks with structured scoring rubrics."],
                            ["Instruction Following", "Tasks that test how precisely a model follows multi-part, constrained instructions with clear success criteria."],
                            ["Domain-Specific", "Specialized benchmarks for fields like medicine, law, finance, and engineering with expert-validated ground truth."],
                            ["Creative & Open-Ended", "Tasks evaluating creative writing, brainstorming, and open-ended problem solving with structured human evaluation."],
                            ["Efficiency & Deployment", "Benchmarks measuring inference speed, memory usage, token efficiency, and deployment characteristics."],
                        ].map(([title, desc]) => (
                            <div
                                key={title}
                                className="flex gap-3 py-3"
                                style={{ borderBottom: "1px solid var(--border)" }}
                            >
                                <span
                                    className="font-mono text-[11px] font-medium flex-shrink-0 mt-0.5"
                                    style={{ color: "var(--green)", minWidth: "180px" }}
                                >
                                    {title}
                                </span>
                                <span
                                    className="font-mono text-xs leading-relaxed"
                                    style={{ color: "var(--subtle)" }}
                                >
                                    {desc}
                                </span>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* Footer */}
                <div
                    className="py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    style={{ borderTop: "1px solid var(--border)" }}
                >
                    <div>
                        <p
                            className="font-mono text-[11px] mb-1"
                            style={{ color: "var(--subtle)" }}
                        >
                            OpenBench Whitepaper · v0.1
                        </p>
                        <p
                            className="font-mono text-[10px]"
                            style={{ color: "var(--muted)" }}
                        >
                            Built in the open. Tasks are reproducible, shareable, and forkable.
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="font-mono text-[11px] transition-colors"
                            style={{ color: "var(--subtle)" }}
                        >
                            ← Home
                        </Link>
                        <Link
                            href="/login"
                            className="inline-flex items-center gap-1.5 font-mono text-[11px] px-4 py-2 rounded-lg transition-all"
                            style={{
                                background: "rgba(0,230,118,0.08)",
                                border: "1px solid rgba(0,230,118,0.25)",
                                color: "var(--green)",
                            }}
                        >
                            Get started →
                        </Link>
                    </div>
                </div>

            </div>
        </div>
    );
}