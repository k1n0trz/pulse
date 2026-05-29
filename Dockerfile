# Pulse API — production image (pnpm monorepo).
# Builds @pulse/shared + @pulse/api, runs prisma migrate deploy on start.

# ---------- base ----------
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# OpenSSL is required by Prisma engines
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
# Web/landing manifests are needed for a complete workspace resolution
COPY apps/web/package.json apps/web/package.json
COPY apps/landing/package.json apps/landing/package.json
RUN pnpm install --frozen-lockfile

# ---------- build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# Generate Prisma client + compile shared and api
RUN pnpm --filter @pulse/api db:generate
RUN pnpm --filter @pulse/shared build
RUN pnpm --filter @pulse/api build

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
# App code + compiled output
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=build /app/packages/shared /app/packages/shared
COPY --from=build /app/apps/api /app/apps/api
WORKDIR /app/apps/api
EXPOSE 4000
ENV HOST=0.0.0.0
ENV PORT=4000
# migrate deploy then start
CMD ["pnpm", "run", "start:prod"]
