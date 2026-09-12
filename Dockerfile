# syntax=docker/dockerfile:1

# ── Stage 1: Build React Frontend ───────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Copy root package files
COPY package*.json ./
RUN npm ci

# Copy frontend source and build
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src

# Default API URL for production build (can be overridden via build arg)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ── Stage 2: Production Runtime ─────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    APP_TIMEZONE=Asia/Kolkata

# Install backend production dependencies
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source code
COPY backend ./

# Copy built frontend assets to /app/dist
COPY --from=frontend-builder /app/dist /app/dist

# Expose server port
EXPOSE 3001

# Run server
CMD ["node", "server.js"]
