"use client";

// src/components/ProjectTypeSelector.tsx
//
// Fetches the list of active benchmark types from the database.
// Only types activated by an admin in Settings → Benchmark Types appear here.

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  Sigma,
  Code,
  Image,
  Bot,
  FileText,
  ShieldCheck,
  MessageSquare,
  Stethoscope,
  PenTool,
  Gauge,
} from "lucide-react";

// Fallback icons keyed by benchmark type id
const TYPE_ICONS: Record<string, React.ElementType> = {
  general_knowledge: BrainCircuit,
  mathematical_reasoning: Sigma,
  coding_software: Code,
  multimodal: Image,
  agentic_tool_use: Bot,
  long_context: FileText,
  safety_alignment: ShieldCheck,
  instruction_following: MessageSquare,
  domain_specific: Stethoscope,
  creative_open_ended: PenTool,
  efficiency_deployment: Gauge,
};

export interface BenchmarkTypeInfo {
  id: string;
  label: string;
}

// Fallback in case the API call fails
const FALLBACK_TYPES: BenchmarkTypeInfo[] = [
  { id: "coding_software", label: "Coding & Software" },
  { id: "general_knowledge", label: "General Knowledge" },
  { id: "mathematical_reasoning", label: "Mathematical Reasoning" },
];

interface ProjectTypeSelectorProps {
  value: string;
  onChange: (type: string) => void;
}

export function ProjectTypeSelector({ value, onChange }: ProjectTypeSelectorProps) {
  const [types, setTypes] = useState<BenchmarkTypeInfo[]>(FALLBACK_TYPES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/benchmark-types")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setTypes(data);
        }
      })
      .catch(() => {
        // Keep fallback on network error
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <span className="block section-label mb-2">Project Type</span>
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded text-xs font-mono" style={{ color: "var(--subtle)" }}>
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading benchmark types…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {types.map((pt) => {
            const active = value === pt.id;
            const Icon = TYPE_ICONS[pt.id] || Code;
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
      )}
      {!loading && types.length === 0 && (
        <p className="text-xs font-mono mt-1" style={{ color: "var(--muted)" }}>
          No benchmark types activated. Ask an admin to enable them in Settings → Benchmark Types.
        </p>
      )}
    </div>
  );
}