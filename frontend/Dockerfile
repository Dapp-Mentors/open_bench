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

# Create SQLite DB (build-time only for schema push)
RUN DATABASE_URL="file:/app/dev.db" \
    npx prisma db push \
    --schema=src/lib/prisma/schema.prisma \
    --skip-generate \
    --accept-data-loss

RUN npm run build


# ---------------------------------
# Stage 3: Runner
# ---------------------------------
FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN apk add --no-cache openssl

# Create non-root user safely (no UID conflicts)
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Copy standalone output into the correct location
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone /app/.next/standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/static /app/.next/standalone/.next/static

# Prisma runtime (must live inside standalone so server.js can find them)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma /app/.next/standalone/node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma /app/.next/standalone/node_modules/@prisma

# SQLite DB
COPY --from=builder /app/dev.db /app/.next/standalone/dev.db

RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV DATABASE_URL="file:/app/.next/standalone/dev.db"

CMD ["node", ".next/standalone/server.js"]