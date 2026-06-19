-- Create BenchmarkType table for admin-managed benchmark categories

CREATE TABLE "BenchmarkType" (
    "id"        TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkType_pkey" PRIMARY KEY ("id")
);

-- Seed default benchmark types
INSERT INTO "BenchmarkType" ("id", "label", "active", "sortOrder") VALUES
    ('general_knowledge', 'General Knowledge', true, 1),
    ('mathematical_reasoning', 'Mathematical Reasoning', true, 2),
    ('coding_software', 'Coding & Software', true, 3),
    ('multimodal', 'Multimodal', true, 4),
    ('agentic_tool_use', 'Agentic & Tool Use', true, 5),
    ('long_context', 'Long-Context & Retrieval', true, 6),
    ('safety_alignment', 'Safety & Alignment', true, 7),
    ('instruction_following', 'Instruction Following', true, 8),
    ('domain_specific', 'Domain-Specific', true, 9),
    ('creative_open_ended', 'Creative & Open-Ended', true, 10),
    ('efficiency_deployment', 'Efficiency & Deployment', true, 11);