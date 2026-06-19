"use client";

// src/components/ProjectTypeSelector.tsx
//
// Curated list of popular frontier LLM benchmark categories (2025–2026).
// Select the type that best describes the tasks in this project.

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

export const PROJECT_TYPES = [
  {
    id: "general_knowledge",
    label: "General Knowledge",
    description: "MMLU, GPQA, BIG-Bench, HELM",
    icon: BrainCircuit,
  },
  {
    id: "mathematical_reasoning",
    label: "Mathematical Reasoning",
    description: "GSM8K, MATH, AIME, FrontierMath",
    icon: Sigma,
  },
  {
    id: "coding_software",
    label: "Coding & Software",
    description: "HumanEval, SWE-Bench, LiveCodeBench, Terminal-Bench",
    icon: Code,
  },
  {
    id: "multimodal",
    label: "Multimodal",
    description: "MMMU, MathVista, Video-MMMU, CharXiv",
    icon: Image,
  },
  {
    id: "agentic_tool_use",
    label: "Agentic & Tool Use",
    description: "BFCL, AgentBench, GAIA, WebArena, OSWorld",
    icon: Bot,
  },
  {
    id: "long_context",
    label: "Long-Context & Retrieval",
    description: "LongBench, MRCR, needle-in-haystack",
    icon: FileText,
  },
  {
    id: "safety_alignment",
    label: "Safety & Alignment",
    description: "TruthfulQA, HHH, FACTS, red-teaming evals",
    icon: ShieldCheck,
  },
  {
    id: "instruction_following",
    label: "Instruction Following",
    description: "IFEval, MT-Bench, Chatbot Arena, AlpacaEval",
    icon: MessageSquare,
  },
  {
    id: "domain_specific",
    label: "Domain-Specific",
    description: "LegalBench, MedQA, LifeSciBench, finance",
    icon: Stethoscope,
  },
  {
    id: "creative_open_ended",
    label: "Creative & Open-Ended",
    description: "Writing, ideation, human preference eval",
    icon: PenTool,
  },
  {
    id: "efficiency_deployment",
    label: "Efficiency & Deployment",
    description: "Latency, throughput, cost, RE-Bench, MLE-Bench",
    icon: Gauge,
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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
