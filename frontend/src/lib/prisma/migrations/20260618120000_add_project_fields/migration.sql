-- Add new fields to Project: projectType, rules, tags
-- Change description column to TEXT type for longer content

ALTER TABLE "Project" ADD COLUMN "projectType" TEXT NOT NULL DEFAULT 'coding_software';
ALTER TABLE "Project" ADD COLUMN "rules" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';