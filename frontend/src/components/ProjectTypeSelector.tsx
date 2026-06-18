"use client";

// src/components/ProjectTypeSelector.tsx
//
// A selector for the type of benchmark project.
// Displays a grid of project types with icons and descriptions.

import { Code, FileText, Languages, Image, Video, AudioLines, BrainCircuit, Database, Shield, Wrench } from "lucide-react";

export const PROJECT_TYPES = [
  {
    id: "coding_benchmark",
    label: "Coding Benchmark",
    description: "Code generation, debugging, refactoring tasks",
    icon: Code,
  },
  {
    id: "writing",
    label: "Writing",
    description: "Essay, report, creative writing evaluation",
    icon: FileText,
  },
  {
    id: "language",
    label: "Language",
    description: "Translation, summarization, grammar tasks",
    icon: Languages,
  },
  {
    id: "image",
    label: "Image",
    description: "Image generation, analysis, editing tasks",
    icon: Image,
  },
  {
    id: "video",
    label: "Video",
    description: "Video understanding, generation, editing",
    icon: Video,
  },
  {
    id: "audio",
    label: "Audio",
    description: "Speech, music, sound analysis tasks",
    icon: AudioLines,
  },
  {
    id: "reasoning",
    label: "Reasoning",
    description: "Logic, math, puzzle-solving benchmarks",
    icon: BrainCircuit,
  },
  {
    id: "data_analysis",
    label: "Data Analysis",
    description: "Data processing, visualization, insights",
    icon: Database,
  },
  {
    id: "security",
    label: "Security",
    description: "Vulnerability detection, secure coding",
    icon: Shield,
  },
  {
    id: "tool_use",
    label: "Tool Use",
    description: "API calling, function calling, agent tasks",
    icon: Wrench,
  },
] as const;

export type ProjectTypeId = (typeof PROJECT_TYPES)[number]["id"];

interface ProjectTypeSelectorProps {
  value: string;
  onChange: (type: string) => void;
}

export function ProjectTypeSelector({ value, onChange }: ProjectTypeSelectorProps) {
  return (
    <div>
      <span className="block section-label mb-2">Project Type</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {PROJECT_TYPES.map((pt) => {
          const active = value === pt.id;
          const Icon = pt.icon;
          return (
            <button
              key={pt.id}
              type="button"
              onClick={() => onChange(pt.id)}
              className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg text-center transition-all"
              style={{
                background: active ? "rgba(0,230,118,0.08)" : "var(--surface)",
                border: active
                  ? "1px solid rgba(0,230,118,0.4)"
                  : "1px solid var(--border)",
              }}
            >
              <Icon
                className="w-5 h-5"
                style={{ color: active ? "var(--green)" : "var(--subtle)" }}
              />
              <span
                className="text-xs font-mono leading-tight"
                style={{ color: active ? "var(--green)" : "var(--subtle)" }}
              >
                {pt.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}