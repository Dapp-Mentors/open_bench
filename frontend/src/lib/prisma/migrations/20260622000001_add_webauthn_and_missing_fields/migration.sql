-- Add all missing AppSettings columns that were added to the schema
-- but never created in a proper migration (siaIndexerUrl, siaAppName,
-- siaAppDescription, googleClientId, googleClientSecret, githubClientId,
-- githubClientSecret, webauthnRpId, webauthnOrigin)

ALTER TABLE "AppSettings"
  ADD COLUMN IF NOT EXISTS "siaIndexerUrl"      TEXT,
  ADD COLUMN IF NOT EXISTS "siaAppName"          TEXT,
  ADD COLUMN IF NOT EXISTS "siaAppDescription"   TEXT,
  ADD COLUMN IF NOT EXISTS "googleClientId"      TEXT,
  ADD COLUMN IF NOT EXISTS "googleClientSecret"  TEXT,
  ADD COLUMN IF NOT EXISTS "githubClientId"      TEXT,
  ADD COLUMN IF NOT EXISTS "githubClientSecret"  TEXT,
  ADD COLUMN IF NOT EXISTS "webauthnRpId"        TEXT,
  ADD COLUMN IF NOT EXISTS "webauthnOrigin"      TEXT;