FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
COPY prisma ./prisma

RUN npm install --omit=dev && npm cache clean --force

FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN groupadd -r ems && useradd -r -g ems ems

COPY --from=deps --chown=ems:ems /app/node_modules ./node_modules
COPY --from=deps --chown=ems:ems /app/prisma ./prisma
COPY --from=deps --chown=ems:ems /app/package.json ./package.json

COPY --chown=ems:ems backend/ ./

USER ems

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/server.js"]