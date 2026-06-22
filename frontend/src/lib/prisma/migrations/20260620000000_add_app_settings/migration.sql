-- Create AppSettings table for the setup wizard
-- Stores one row (id='default') with setup completion flags and secrets

CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "setupComplete" BOOLEAN NOT NULL DEFAULT false,
    "siaConnected" BOOLEAN NOT NULL DEFAULT false,
    "siaAppId" TEXT,
    "openrouterKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);