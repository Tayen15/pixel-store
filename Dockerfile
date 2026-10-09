# ==============================================================================
# Multi-Stage Dockerfile for Pixel Store (Astro SSR + Node Adapter)
#
# The production runtime intentionally uses Node.js, NOT Bun.
# The Astro adapter in use is `@astrojs/node` and `package.json` declares
# `engines.node >= 22.12.0`, so the compiled bundle is a standard Node server.
# Bun is used only as the build/dev tool.
#
# Why: Bun requires the SSE4.2 CPU instruction. On hosts without SSE4.2
# (e.g. AMD C-60 / Bobcat, x86-64-v1) the server dies instantly with SIGILL
# (exit code 132) plus a kernel "trap invalid opcode" — and Bun's official
# `baseline` build crashes there too. Node.js has no such requirement.
#
# !! Do NOT switch the runner stage back to `oven/bun` or CMD back to `bun`
# !! unless every target CPU supports SSE4.2 — it silently breaks those hosts.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Dependencies & Build Stage (Bun — build host only, needs a modern CPU)
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
# 2. Production Dependencies Stage
# ------------------------------------------------------------------------------
# Installed in its own clean stage so node_modules contains production
# dependencies only (no devDependencies left over from the build stage).
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS prod-deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# ------------------------------------------------------------------------------
# 3. Production Runner Stage
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Production environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# Copy production dependencies and the compiled SSR server + static bundles
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=prod-deps /app/package.json ./package.json

# Health check to ensure server responds
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4321/ || exit 1

# Expose port
EXPOSE 4321

# Switch to unprivileged node user
USER node

# Run Astro Standalone Node Server
CMD ["node", "./dist/server/entry.mjs"]
