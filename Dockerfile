# syntax=docker/dockerfile:1

FROM node:22-slim AS builder

WORKDIR /app

# Prisma necesita openssl para detectar libssl correctamente
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copiar manifiestos del workspace para aprovechar cache de capas
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci --workspace=server

# Generar Prisma Client y compilar TypeScript del servidor
COPY server/prisma ./server/prisma
RUN npx prisma generate --schema=server/prisma/schema.prisma

COPY server/tsconfig.json ./server/
COPY server/src ./server/src
RUN npm run build --workspace=server \
  && npm prune --omit=dev --workspace=server

FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma

USER node

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
