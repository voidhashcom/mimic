FROM oven/bun:1 AS pruner
RUN bun install -g turbo@^2.7.1
WORKDIR /app
COPY . .
RUN turbo prune @voidhash/mimic-host --docker

FROM oven/bun:1 AS deps
RUN bun install -g pnpm@10.19.0
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY --from=pruner /app/out/full/ .
RUN pnpm install --frozen-lockfile
RUN cd apps/host && bun run build

FROM oven/bun:1 AS release
WORKDIR /app
COPY --from=build /app/apps/host/dist ./dist
COPY --from=build /app/apps/host/package.json ./

EXPOSE 50000
ENTRYPOINT ["bun", "run", "dist/index.js"]
