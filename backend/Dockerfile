# ════════════════════════════════════════════════════════════════════
# IMSE EASY EMS — Backend container
# ════════════════════════════════════════════════════════════════════
# Multi-stage build for a small production image (~150 MB).
# Same image runs locally (docker compose) and on Cloud Run.
# ════════════════════════════════════════════════════════════════════

# ── Stage 1: install dependencies ─────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests only for better layer caching
COPY package.json package-lock.json* ./
# Prisma schema is needed at install time because `postinstall` runs `prisma generate`
COPY ../prisma ./prisma

RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 2: production runtime ───────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Non-root user for security
RUN addgroup -S ems && adduser -S ems -G ems

# Copy installed node_modules (with generated Prisma client)
COPY --from=deps --chown=ems:ems /app/node_modules ./node_modules
COPY --from=deps --chown=ems:ems /app/prisma ./prisma

# Copy source
COPY --chown=ems:ems . .

# Frontend served from /app/frontend (dev only; prod serves from CDN or GitHub Pages)
# In prod, front-end files come from a separate static host.

USER ems

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Cloud Run sets PORT dynamically; server.js reads process.env.PORT
CMD ["node", "src/server.js"]
