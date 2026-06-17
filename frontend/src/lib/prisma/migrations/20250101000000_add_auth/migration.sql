-- Migration: add_auth_tables
-- Drop in: frontend/src/lib/prisma/migrations/YYYYMMDD_add_auth/migration.sql
-- Run after the existing initial migration.

-- Role enum
CREATE TYPE "Role" AS ENUM ('user', 'admin', 'super_admin');

-- User table
CREATE TABLE "User" (
    "id"            TEXT NOT NULL,
    "name"          TEXT,
    "email"         TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image"         TEXT,
    "role"          "Role" NOT NULL DEFAULT 'user',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Account table (OAuth provider links)
CREATE TABLE "Account" (
    "id"                TEXT NOT NULL,
    "userId"            TEXT NOT NULL,
    "type"              TEXT NOT NULL,
    "provider"          TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token"     TEXT,
    "access_token"      TEXT,
    "expires_at"        INTEGER,
    "token_type"        TEXT,
    "scope"             TEXT,
    "id_token"          TEXT,
    "session_state"     TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- Session table
CREATE TABLE "Session" (
    "id"           TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "expires"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- VerificationToken table
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token"      TEXT NOT NULL,
    "expires"    TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- Passkey table (WebAuthn credentials)
CREATE TABLE "Passkey" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey"    TEXT NOT NULL,
    "counter"      BIGINT NOT NULL DEFAULT 0,
    "deviceType"   TEXT NOT NULL DEFAULT 'platform',
    "backedUp"     BOOLEAN NOT NULL DEFAULT false,
    "transports"   TEXT,
    "name"         TEXT NOT NULL DEFAULT 'Passkey',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"   TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- Foreign keys
ALTER TABLE "Account"  ADD CONSTRAINT "Account_userId_fkey"  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session"  ADD CONSTRAINT "Session_userId_fkey"  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Passkey"  ADD CONSTRAINT "Passkey_userId_fkey"  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
