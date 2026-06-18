"use client";

// src/components/MarkdownEditor.tsx
//
// A lightweight markdown editor with live preview.
// Uses react-markdown for rendering and remark-gfm for GitHub-flavored markdown.

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Edit3, Maximize2, Minimize2 } from "lucide-react";

// Injected once into <head> so the markdown preview renders properly
// without needing @tailwindcss/typography.
const MD_PREVIEW_STYLES = `
.md-preview h1, .md-preview h2, .md-preview h3,
.md-preview h4, .md-preview h5, .md-preview h6 {
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--text);
  margin-top: 1rem;
  margin-bottom: 0.35rem;
  line-height: 1.3;
}
.md-preview h1 { font-size: 1.15rem; }
.md-preview h2 { font-size: 1.05rem; }
.md-preview h3 { font-size: 0.95rem; }
.md-preview h4, .md-preview h5, .md-preview h6 { font-size: 0.875rem; }

.md-preview p {
  color: var(--subtle);
  margin-top: 0.4rem;
  margin-bottom: 0.4rem;
  line-height: 1.65;
}

.md-preview ul {
  list-style-type: disc;
  padding-left: 1.4rem;
  margin-top: 0.4rem;
  margin-bottom: 0.4rem;
}
.md-preview ol {
  list-style-type: decimal;
  padding-left: 1.4rem;
  margin-top: 0.4rem;
  margin-bottom: 0.4rem;
}
.md-preview li {
  color: var(--subtle);
  margin-top: 0.2rem;
  margin-bottom: 0.2rem;
  line-height: 1.6;
}
.md-preview li > ul,
.md-preview li > ol {
  margin-top: 0.15rem;
  margin-bottom: 0.15rem;
}

.md-preview strong {
  font-weight: 600;
  color: var(--text);
}
.md-preview em {
  font-style: italic;
  color: var(--subtle);
}

.md-preview code {
  font-family: var(--font-mono, monospace);
  font-size: 0.8rem;
  color: var(--green);
  background: rgba(0, 230, 118, 0.08);
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
}
.md-preview pre {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  padding: 0.75rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  overflow-x: auto;
}
.md-preview pre code {
  background: transparent;
  padding: 0;
  color: var(--text);
  font-size: 0.8rem;
}

.md-preview blockquote {
  border-left: 2px solid var(--green);
  padding-left: 0.75rem;
  margin: 0.5rem 0;
  color: var(--muted);
  font-style: normal;
}

.md-preview a {
  color: var(--green);
  text-decoration: none;
}
.md-preview a:hover {
  text-decoration: underline;
}

.md-preview hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 0.75rem 0;
}

.md-preview table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  margin: 0.5rem 0;
}
.md-preview th {
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  color: var(--text);
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.md-preview td {
  color: var(--subtle);
  padding: 0.35rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
`;

function useInjectStyles(id: string, css: string) {
  useEffect(() => {
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
    return () => { document.getElementById(id)?.remove(); };
  }, [id, css]);
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxLength?: number;
  label?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write in markdown…",
  minHeight = 200,
  maxLength,
  label,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview" | "split">("edit");
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useInjectStyles("md-preview-styles", MD_PREVIEW_STYLES);

  // Tab key support: insert 2 spaces
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const newVal = before + "  " + after;
        onChange(newVal);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
    };
    ta.addEventListener("keydown", handler);
    return () => ta.removeEventListener("keydown", handler);
  }, [value, onChange]);

  const charCount = value.length;
  const overLimit = maxLength !== undefined && charCount > maxLength;

  return (
    <div
      className={`rounded-lg border transition-all ${expanded ? "fixed inset-4 z-50 flex flex-col" : ""
        }`}
      style={{
        background: "var(--surface)",
        borderColor: overLimit ? "rgba(255,68,68,0.4)" : "var(--border)",
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b rounded-t-lg"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-1">
          {label && (
            <span
              className="text-xs font-mono font-medium mr-2"
              style={{ color: "var(--subtle)" }}
            >
              {label}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${mode === "edit"
                ? "bg-white/10 text-white"
                : "text-[var(--muted)] hover:text-[var(--subtle)]"
              }`}
          >
            <Edit3 className="w-3 h-3 inline mr-1" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${mode === "preview"
                ? "bg-white/10 text-white"
                : "text-[var(--muted)] hover:text-[var(--subtle)]"
              }`}
          >
            <Eye className="w-3 h-3 inline mr-1" />
            Preview
          </button>
          <button
            type="button"
            onClick={() => setMode("split")}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${mode === "split"
                ? "bg-white/10 text-white"
                : "text-[var(--muted)] hover:text-[var(--subtle)]"
              }`}
          >
            Split
          </button>
        </div>
        <div className="flex items-center gap-2">
          {maxLength !== undefined && (
            <span
              className={`text-xs font-mono ${overLimit ? "text-red-400" : "text-[var(--muted)]"
                }`}
            >
              {charCount}/{maxLength}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--subtle)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
          >
            {expanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className={`flex ${expanded ? "flex-1 min-h-0" : ""} ${mode === "split" ? "flex-row" : "flex-col"
          }`}
      >
        {/* Textarea */}
        {(mode === "edit" || mode === "split") && (
          <div
            className={mode === "split" ? "w-1/2 border-r" : "w-full"}
            style={{ borderColor: "var(--border)" }}
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full p-3 text-sm font-mono outline-none resize-none"
              style={{
                background: "transparent",
                color: "var(--text)",
                minHeight: expanded ? undefined : `${minHeight}px`,
                height: expanded ? "100%" : undefined,
              }}
            />
          </div>
        )}

        {/* Preview */}
        {(mode === "preview" || mode === "split") && (
          <div
            className={`overflow-y-auto ${mode === "split" ? "w-1/2" : "w-full"
              }`}
            style={{
              minHeight: expanded ? undefined : `${minHeight}px`,
              maxHeight: expanded ? "100%" : "400px",
            }}
          >
            {value.trim() ? (
              <div className="md-preview p-3 text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {value}
                </ReactMarkdown>
              </div>
            ) : (
              <div
                className="p-3 text-sm font-mono"
                style={{ color: "var(--muted)" }}
              >
                Nothing to preview yet…
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}