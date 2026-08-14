FROM node:22.22.0-alpine

RUN apk add --no-cache curl git openssl

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/auth-sdk/package.json packages/auth-sdk/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/mock-data/package.json packages/mock-data/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/platform-api/package.json apps/platform-api/package.json
COPY scripts/quality/prepare-git-hooks.mjs scripts/quality/prepare-git-hooks.mjs

RUN corepack enable && pnpm install --frozen-lockfile

COPY packages packages
COPY apps/platform-api apps/platform-api
COPY templates templates

RUN pnpm --filter @evcp/platform-api exec prisma generate --schema prisma/schema.prisma \
  && pnpm --filter @evcp/platform-api build

ENV HOST=0.0.0.0
ENV PORT=3100

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1

CMD ["sh", "-lc", "pnpm --filter @evcp/platform-api exec prisma migrate deploy --schema prisma/schema.prisma && pnpm --filter @evcp/platform-api seed && pnpm --filter @evcp/platform-api start"]
