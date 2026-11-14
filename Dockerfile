# Multi-stage Production Dockerfile for pvtSender
# Full-Stack WhatsApp SaaS + Multi-Source Lead Intelligence Extractor

# ==========================================
# Stage 1: Build React Client (Vite)
# ==========================================
FROM node:20-bookworm-slim AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Backend Server (TypeScript)
# ==========================================
FROM node:20-bookworm-slim AS server-builder
WORKDIR /app/server

# Install C++ native build toolchain for better-sqlite3 compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

# ==========================================
# Stage 3: Lightweight Production Runner
# ==========================================
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# Install native dependencies and curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies for server
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled server build
COPY --from=server-builder /app/server/dist ./dist

# Copy compiled client build to expected path
WORKDIR /app/client
COPY --from=client-builder /app/client/dist ./dist

# Create persistent data directories
WORKDIR /app/server
RUN mkdir -p /app/server/data/sessions

# Expose server port
EXPOSE 3000

# Healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "dist/index.js"]

