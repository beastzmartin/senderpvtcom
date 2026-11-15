# Multi-stage Production Dockerfile for pvtSender
# Full-Stack WhatsApp SaaS + Multi-Source Lead Intelligence Extractor

# ==========================================
# Stage 1: Build React Frontend (Vite)
# ==========================================
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Build Backend Server (TypeScript)
# ==========================================
FROM node:20-bookworm-slim AS backend-builder
WORKDIR /app/backend

# Install C++ native build toolchain for better-sqlite3 compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
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

# Install production dependencies for backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled backend build
COPY --from=backend-builder /app/backend/dist ./dist

# Copy compiled frontend build to expected path
WORKDIR /app/frontend
COPY --from=frontend-builder /app/frontend/dist ./dist

# Create persistent data directories
WORKDIR /app/backend
RUN mkdir -p /app/backend/data/sessions

# Expose server port
EXPOSE 3000

# Healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "dist/index.js"]

