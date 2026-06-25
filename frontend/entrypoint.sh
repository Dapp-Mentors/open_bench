#!/bin/sh
# entrypoint.sh — runs database migrations then starts the Next.js server
set -e

# Ensure NextAuth trusts the incoming Host header (no manual AUTH_URL needed)
export AUTH_TRUST_HOST="${AUTH_TRUST_HOST:-1}"

echo "[entrypoint] Running Prisma migrations..."

# The Prisma schema, migrations, and CLI are all inside the standalone
# directory. We run the prisma CLI from there so it can find its
# @prisma/engines dependency (which lives in standalone's node_modules).
cd /app/.next/standalone
node node_modules/prisma/build/index.js migrate deploy \
  --schema=src/lib/prisma/schema.prisma
cd /app

echo "[entrypoint] Migrations complete. Starting server..."
exec node .next/standalone/server.js
