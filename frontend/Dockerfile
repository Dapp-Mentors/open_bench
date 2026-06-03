ARG NODE_VERSION=24.10.0
FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app

# ─────────────────────────────────────────
# deps stage — install dependencies
# ─────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci

# ─────────────────────────────────────────
# dev stage — used by docker-compose
# ─────────────────────────────────────────
FROM base AS dev
RUN apk add --no-cache libc6-compat openssl

# Copy deps from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the source
COPY . .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3000
# Actual start command is overridden by docker-compose for dev
CMD ["npm", "run", "dev"]

# ─────────────────────────────────────────
# builder stage — production build
# ─────────────────────────────────────────
FROM base AS builder
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# ─────────────────────────────────────────
# production runner
# ─────────────────────────────────────────
FROM base AS production
RUN apk add --no-cache openssl
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["node", "server.js"]