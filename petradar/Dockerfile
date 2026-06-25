# syntax=docker/dockerfile:1

# ── Stage 1: build ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copiar todo el proyecto primero (evita errores de tsconfig)
COPY . .

# Instalar dependencias (más estable que npm ci en tu caso)
RUN npm install

# Compilar NestJS
RUN npm run build


# ── Stage 2: production ───────────────────────────────────────
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copiar solo lo necesario del build
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]