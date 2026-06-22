-- Create PasskeyChallenge table for DB-backed challenge store
-- Replaces the in-memory Map that was wiped on every cold start

CREATE TABLE IF NOT EXISTS "PasskeyChallenge" (
    "id"        TEXT    NOT NULL,
    "key"       TEXT    NOT NULL,
    "challenge" TEXT    NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,

    CONSTRAINT "PasskeyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasskeyChallenge_key_key" ON "PasskeyChallenge"("key");
CREATE INDEX IF NOT EXISTS "PasskeyChallenge_expiresAt_idx" ON "PasskeyChallenge"("expiresAt");