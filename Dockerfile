# ==============================================================================
# Multi-Stage Dockerfile for Pixel Store (Next.js 16+ App Router Standalone)
#
# Production runtime uses Node.js with Next.js standalone output.
# Bun is used for fast dependency resolution and compiling during build.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Dependencies & Build Stage (Bun)
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build standalone production bundle
ENV NODE_ENV=production
RUN bun run build

# ------------------------------------------------------------------------------
# 2. Production Runner Stage (Node.js)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=4321

# Copy public static files, standalone server, and Next.js static bundle
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4321/ || exit 1

EXPOSE 4321

USER node

CMD ["node", "server.js"]
