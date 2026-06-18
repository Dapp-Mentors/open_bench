"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, FolderPlus, Terminal, CheckCircle, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { ProjectTypeSelector } from "@/components/ProjectTypeSelector";
import { TagInput } from "@/components/TagInput";

const DOMAINS = [
  "Software Engineering",
  "Sys-Admin",
  "Security",
  "Scientific Computing",
  "Finance",
  "DevOps",
];

const TAG_SUGGESTIONS = [
  "python", "javascript", "typescript", "rust", "go", "java", "c++",
  "react", "node", "docker", "kubernetes", "aws", "gcp", "azure",
  "llm", "rag", "prompt-engineering", "sql", "api", "cli",
  "beginner", "intermediate", "advanced", "expert",
  "code-gen", "debugging", "refactoring", "testing", "documentation",
];

type CreateState = "idle" | "creating" | "success" | "error";

export default function NewProject() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [projectType, setProjectType] = useState("coding_benchmark");
  const [rules, setRules] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [state, setState] = useState<CreateState>("idle");
  const [error, setError] = useState<string | null>(null);

  const canCreate =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    domain.length > 0 &&
    state === "idle";

  async function handleCreate() {
    if (!canCreate) return;
    setState("creating");
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          domain,
          projectType,
          rules: rules.trim(),
          tags,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create project");
      }
      const { id } = await res.json();
      setState("success");
      setTimeout(() => router.push(`/projects/${id}`), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

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
          Project created
        </h2>
        <p className="text-sm font-mono" style={{ color: "var(--subtle)" }}>
          Taking you there now…
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
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
        <div className="section-label mb-2">Projects</div>
        <h1 className="font-display text-2xl font-bold mb-2" style={{ color: "var(--text)" }}>
          New Project
        </h1>
        <p className="text-sm" style={{ color: "var(--subtle)", lineHeight: 1.6 }}>
          A project groups related benchmark tasks together. Once created, you can
          submit tasks to it, track each one through the curation pipeline, and
          run approved tasks against any model.
        </p>
      </div>

      {/* How it flows */}
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-lg mb-8 border text-xs font-mono"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--subtle)" }}
      >
        <FolderPlus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--green)" }} />
        <span style={{ color: "var(--green)" }}>Project</span>
        <ChevronRight className="w-3 h-3" />
        <Terminal className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Tasks (submit .zip)</span>
        <ChevronRight className="w-3 h-3" />
        <span>Pipeline</span>
        <ChevronRight className="w-3 h-3" />
        <span>Runs</span>
      </div>

      <div className="space-y-6">
        {/* Project name */}
        <div>
          <label htmlFor="proj-name" className="block section-label mb-2">
            Project Name
          </label>
          <input
            id="proj-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rust build-failure suite"
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
        </div>

        {/* Project Type */}
        <ProjectTypeSelector value={projectType} onChange={setProjectType} />

        {/* Description — markdown editor */}
        <div>
          <MarkdownEditor
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="What kind of tasks will live in this project? What are you trying to evaluate?"
            minHeight={150}
          />
        </div>

        {/* Domain */}
        <div>
          <label className="block section-label mb-2">Domain</label>
          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((d) => {
              const active = domain === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDomain(d)}
                  className="px-3 py-1.5 rounded text-xs font-mono transition-all"
                  style={{
                    background: active ? "rgba(0,230,118,0.1)" : "var(--surface)",
                    border: active ? "1px solid rgba(0,230,118,0.4)" : "1px solid var(--border)",
                    color: active ? "var(--green)" : "var(--subtle)",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs font-mono" style={{ color: "var(--muted)" }}>
            You can mix domains inside a project — this just sets the primary focus.
          </p>
        </div>

        {/* Rules — markdown editor */}
        <div>
          <MarkdownEditor
            label="Rules"
            value={rules}
            onChange={setRules}
            placeholder={`## Project Rules

Define the guidelines for evaluating tasks in this project.

- What criteria should submissions meet?
- Are there specific quality standards?
- Any formatting or documentation requirements?

\`\`\`
Example: All submissions must include:
- A clear problem statement
- Expected input/output format
- At least 3 test cases
\`\`\``}
            minHeight={150}
          />
          <p className="mt-1 text-xs font-mono" style={{ color: "var(--muted)" }}>
            Describe rules and guidelines for task submission, evaluation criteria, etc. (Markdown supported)
          </p>
        </div>

        {/* Tags */}
        <TagInput
          label="Tags"
          tags={tags}
          onChange={setTags}
          suggestions={TAG_SUGGESTIONS}
          placeholder="Add tags (e.g. python, code-gen, advanced)"
        />

        {/* What happens next */}
        <div
          className="p-4 rounded-lg border"
          style={{ background: "rgba(0,230,118,0.03)", borderColor: "rgba(0,230,118,0.15)" }}
        >
          <div className="section-label mb-3" style={{ color: "var(--green)" }}>
            What happens after you create it
          </div>
          <div className="space-y-2.5">
            {[
              { n: "1", text: "You land on the project page — empty tasks list, ready to go" },
              { n: "2", text: "Submit task .zips built to the Harbor spec — one at a time or in bulk" },
              { n: "3", text: "Each task runs through the 5-stage curation pipeline automatically" },
              { n: "4", text: "Approved tasks become runnable — pick a model and fire off a benchmark run" },
              { n: "5", text: "Results, logs, and Sia proof links all live on the task detail page" },
            ].map((step) => (
              <div key={step.n} className="flex gap-3 items-start">
                <span
                  className="font-mono text-xs w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border"
                  style={{
                    color: "var(--subtle)",
                    borderColor: "var(--border)",
                    background: "var(--muted)",
                    marginTop: "1px",
                  }}
                >
                  {step.n}
                </span>
                <p className="text-xs leading-relaxed" style={{ color: "var(--subtle)" }}>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
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
            {error ?? "Something went wrong. Try again."}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href="/dashboard"
            className="bench-btn-ghost px-4 py-2.5 rounded text-sm font-mono"
          >
            Cancel
          </Link>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="bench-btn-primary px-5 py-2.5 rounded text-sm font-mono flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state === "creating" ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <FolderPlus className="w-3.5 h-3.5" />
                Create Project
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}