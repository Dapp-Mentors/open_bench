-- Add paused field to Project for pause/unpause functionality
ALTER TABLE "Project" ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false;