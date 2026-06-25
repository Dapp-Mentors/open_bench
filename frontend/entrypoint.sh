#!/bin/sh
# entrypoint.sh - runs database migrations then starts the Next.js server
set -e

# AUTH_TRUST_HOST lets NextAuth use the incoming Host header for OAuth callback URLs
export AUTH_TRUST_HOST="${AUTH_TRUST_HOST:-1}"

echo "[entrypoint] Running Prisma migrations..."
cd /app/.next/standalone
node node_modules/prisma/build/index.js migrate deploy \
  --schema=src/lib/prisma/schema.prisma
cd /app

echo "[entrypoint] Migrations complete. Starting server..."
exec node .next/standalone/server.js