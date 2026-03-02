FROM node:22-slim AS base
WORKDIR /app
RUN npm install -g pnpm@10 && npm install -g bun

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/host/package.json ./apps/host/
COPY packages/mimic/package.json ./packages/mimic/
COPY packages/mimic-protocol/package.json ./packages/mimic-protocol/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/host/node_modules ./apps/host/node_modules
COPY --from=deps /app/packages ./packages
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.json ./
COPY packages/ ./packages/
COPY apps/host/ ./apps/host/
RUN cd apps/host && bun run build

FROM base AS release
WORKDIR /app
COPY --from=build /app/apps/host/dist ./dist
COPY --from=build /app/apps/host/package.json ./

EXPOSE 50000
ENTRYPOINT ["bun", "run", "dist/index.js"]
