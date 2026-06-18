"use client";

// src/components/MarkdownEditor.tsx
//
// A lightweight markdown editor with live preview.
// Uses react-markdown for rendering and remark-gfm for GitHub-flavored markdown.

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Edit3, Maximize2, Minimize2 } from "lucide-react";

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
            style={{ minHeight: expanded ? undefined : `${minHeight}px`, maxHeight: expanded ? "100%" : "400px" }}
          >
            {value.trim() ? (
              <div
                className="p-3 text-sm prose prose-invert max-w-none
                  prose-headings:font-mono prose-headings:text-[var(--text)] prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                  prose-p:text-[var(--subtle)] prose-p:my-1.5
                  prose-li:text-[var(--subtle)] prose-li:my-0.5
                  prose-ul:my-1.5 prose-ul:pl-4 prose-ol:my-1.5 prose-ol:pl-4
                  prose-strong:text-[var(--text)] prose-strong:font-semibold
                  prose-code:text-[var(--green)] prose-code:bg-[rgba(0,230,118,0.08)] prose-code:px-1 prose-code:rounded prose-code:text-xs
                  prose-pre:bg-[var(--bg)] prose-pre:border prose-pre:border-[var(--border)] prose-pre:rounded prose-pre:p-3
                  prose-a:text-[var(--green)] prose-a:no-underline hover:prose-a:underline
                  prose-blockquote:border-l-2 prose-blockquote:border-[var(--green)] prose-blockquote:pl-3 prose-blockquote:text-[var(--muted)] prose-blockquote:not-italic
                  prose-hr:border-[var(--border)]"
              >
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