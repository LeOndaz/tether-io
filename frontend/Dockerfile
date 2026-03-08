FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json ./
RUN pnpm install --no-frozen-lockfile

COPY . .

RUN addgroup -S appgroup && adduser -S -G appgroup appuser
USER appuser

EXPOSE 5173

CMD ["pnpm", "run", "dev", "--", "--host"]
