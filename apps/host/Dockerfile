FROM node:22-slim AS base
WORKDIR /app
RUN npm install -g pnpm@10 && npm install -g bun

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.json ./
COPY apps/host/package.json ./apps/host/
COPY packages/mimic/package.json ./packages/mimic/
COPY packages/mimic-protocol/package.json ./packages/mimic-protocol/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile
COPY packages/ ./packages/
COPY apps/host/ ./apps/host/
RUN cd apps/host && bun run build

FROM base AS release
WORKDIR /app
COPY --from=build /app/apps/host/dist ./dist
COPY --from=build /app/apps/host/package.json ./

EXPOSE 5001
ENTRYPOINT ["bun", "run", "dist/index.js"]
