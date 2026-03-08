FROM node:22-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm build

RUN addgroup --system appgroup && adduser --system --ingroup appgroup --home /home/appuser appuser \
    && chown -R appuser:appgroup /app
USER appuser

CMD ["node", "dist/index.js"]
