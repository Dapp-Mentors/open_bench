# ============================================================
# OpenBench Frontend Dockerfile (FIXED)
# ============================================================

ARG NODE_VERSION=20-alpine

# ---------------------------------
# Stage 1: Dependencies
# ---------------------------------
FROM node:${NODE_VERSION} AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install


# ---------------------------------
# Stage 2: Builder
# ---------------------------------
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=src/lib/prisma/schema.prisma

RUN npm run build


# ---------------------------------
# Stage 3: Runner
# ---------------------------------
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN apk add --no-cache openssl bash

# Create non-root user safely (no UID conflicts)
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Copy standalone output into the correct location
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone /app/.next/standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/static /app/.next/standalone/.next/static

# Prisma runtime (must live inside standalone so server.js can find them)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma /app/.next/standalone/node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma /app/.next/standalone/node_modules/@prisma

# Full node_modules from builder (includes prisma CLI + all its transitive deps
# like 'effect' which @prisma/config needs). Next.js 16 standalone output only
# includes production deps, but prisma is a devDependency.
COPY --from=builder /app/node_modules /app/.next/standalone/node_modules

# Prisma schema + migrations (needed for prisma migrate deploy at runtime)
# Store them inside the standalone dir where the app also reads them via relative paths
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/prisma/schema.prisma /app/.next/standalone/src/lib/prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/prisma/migrations /app/.next/standalone/src/lib/prisma/migrations

# Entrypoint that runs migrations before starting the server
COPY --chown=nextjs:nodejs entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
