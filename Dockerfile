# ==============================================================================
# Multi-Stage Dockerfile for Pixel Store (Astro SSR + Bun + Node Adapter)
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Dependencies & Build Stage
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
# 2. Production Runner Stage
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS runner

WORKDIR /app

# Production environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Install only production dependencies
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# Copy compiled SSR server and static client bundles from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Health check to ensure server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4321/ || exit 1

# Expose port
EXPOSE 4321

# Switch to unprivileged bun user
USER bun

# Run Astro Standalone Node Server
CMD ["bun", "./dist/server/entry.mjs"]
