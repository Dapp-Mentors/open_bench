"use client";

// src/components/TagInput.tsx
//
// A tag input component that lets users add/remove tags.
// Tags are displayed as removable pills with a text input to add new ones.

import { useState, useRef } from "react";
import { X, Plus } from "lucide-react";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  label?: string;
}

export function TagInput({
  tags,
  onChange,
  suggestions = [],
  placeholder = "Add a tag…",
  label,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput("");
    setShowSuggestions(false);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  const filteredSuggestions = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(input.toLowerCase()) &&
      !tags.includes(s.toLowerCase())
  );

  return (
    <div>
      {label && (
        <span className="block section-label mb-2">{label}</span>
      )}
      <div
        className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg min-h-[42px] cursor-text transition-colors"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono"
            style={{
              background: "rgba(0,230,118,0.08)",
              border: "1px solid rgba(0,230,118,0.2)",
              color: "var(--green)",
            }}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="hover:opacity-70 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="relative flex-1 min-w-[120px]">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : ""}
            className="w-full bg-transparent text-sm font-mono outline-none"
            style={{ color: "var(--text)" }}
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div
              className="absolute left-0 top-full mt-1 w-48 rounded-lg border shadow-lg z-10 max-h-40 overflow-y-auto"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
              }}
            >
              {filteredSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-mono transition-colors hover:bg-white/5"
                  style={{ color: "var(--subtle)" }}
                >
                  <Plus className="w-3 h-3 inline mr-1.5" style={{ color: "var(--green)" }} />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs font-mono" style={{ color: "var(--muted)" }}>
        Press Enter or comma to add a tag. Click the × to remove.
      </p>
    </div>
  );
}