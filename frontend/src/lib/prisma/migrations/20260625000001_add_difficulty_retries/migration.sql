-- Add difficultyRetries column to Task table for tracking retry attempts
-- Add difficultyMaxRetries column to AppSettings for admin-configurable limit

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "difficultyRetries" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "difficultyMaxRetries" INTEGER NOT NULL DEFAULT 3;