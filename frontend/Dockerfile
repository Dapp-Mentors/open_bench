# ============================================================
# OpenBench Frontend Dockerfile
# ============================================================
# This Dockerfile uses a multi-stage build:
#   1. deps      — Install production dependencies
#   2. builder   — Build the Next.js standalone application
#   3. runner    — Run the standalone server (lightweight)
#
# Next.js is configured with `output: 'standalone'`, which
# produces a minimal Node.js server. For production, you may
# place this container behind an Nginx reverse proxy (or use
# the provided docker-compose.yml in the project root).
# ============================================================

# Build argument — override via: --build-arg NODE_VERSION=24.10.0
ARG NODE_VERSION=20-alpine

# ---------------------------------
# Stage 1: Install dependencies
# ---------------------------------
FROM node:${NODE_VERSION} AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy only dependency manifests for better layer caching
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies needed for build)
# Using `npm install` to regenerate the lockfile deterministically
RUN npm install

# ---------------------------------
# Stage 2: Build the application
# ---------------------------------
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the source code
COPY . .

# Regenerate Prisma client with the correct binary target for this platform
RUN npx prisma generate --schema=src/lib/prisma/schema.prisma

# Pre-create the SQLite database with all tables so the runner doesn't need prisma CLI
RUN DATABASE_URL="file:/app/dev.db" npx prisma db push --schema=src/lib/prisma/schema.prisma --skip-generate --accept-data-loss

# Next.js will emit a standalone build under .next/standalone/
RUN npm run build

# ---------------------------------
# Stage 3: Run the application
# ---------------------------------
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install openssl — required by Prisma's query engine on Alpine
RUN apk add --no-cache openssl

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy over the public assets
COPY --from=builder /app/public ./public

# Copy the standalone output (includes compiled server + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy the static assets (CSS, JS bundles, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the Prisma generated client (with the correct Linux binary target) into
# the standalone node_modules so Prisma can find its query engine at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy the pre-created SQLite database with all tables
COPY --from=builder /app/dev.db ./dev.db

# Fix ownership so the non-root user can read & write the database
# (SQLite also needs write permission on the directory for WAL/journal files)
RUN chown -R nextjs:nodejs /app && chmod 664 /app/dev.db

# Switch to the non-root user
USER nextjs

# Expose the port the Next.js server listens on
EXPOSE 3000

ENV PORT=3000
ENV DATABASE_URL="file:/app/dev.db"

# Start the standalone Next.js server
CMD ["node", "server.js"]
