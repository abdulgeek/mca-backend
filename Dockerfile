# Build Stage
FROM node:18 AS builder
WORKDIR /app

# Install build dependencies for native modules (canvas, sharp)
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json tsconfig.json ./
RUN npm ci --legacy-peer-deps

# Copy source code and models
COPY src ./src
COPY models ./models

# Build TypeScript
RUN npm run build

# Production Stage
FROM node:18-slim
WORKDIR /app

# Install runtime dependencies for native modules
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Copy node_modules from builder (includes compiled native modules)
COPY --from=builder /app/node_modules ./node_modules

# Copy built application and models from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/models ./models

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5001
EXPOSE 5001

# Create non-root user and switch to it
RUN useradd -m -u 1001 appuser && \
    chown -R appuser:appuser /app
USER appuser

CMD ["node", "dist/server.js"]

