# Build Stage
FROM node:18-slim AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm i

COPY . .
RUN npm run build

# Production Stage
FROM node:18-slim
WORKDIR /app

COPY package*.json ./
RUN npm i --omit=dev

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=5001
EXPOSE 5001

RUN useradd -m appuser
USER appuser

CMD ["node", "dist/server.js"]

