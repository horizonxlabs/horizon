ARG APP_PACKAGE
ARG APP_DIR
ARG STATIC_PREFIX=

FROM node:22.22.0-alpine AS builder

ARG APP_PACKAGE
ARG APP_DIR

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/auth-sdk/package.json packages/auth-sdk/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/mock-data/package.json packages/mock-data/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/creator-web/package.json apps/creator-web/package.json
COPY apps/app-store-pwa/package.json apps/app-store-pwa/package.json
COPY scripts/quality/prepare-git-hooks.mjs scripts/quality/prepare-git-hooks.mjs

RUN corepack enable && pnpm install --frozen-lockfile

COPY packages packages
COPY apps/admin-web apps/admin-web
COPY apps/creator-web apps/creator-web
COPY apps/app-store-pwa apps/app-store-pwa

RUN pnpm --filter "${APP_PACKAGE}" build

FROM nginx:1.27-alpine

ARG APP_DIR
ARG STATIC_PREFIX=

COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /workspace/${APP_DIR}/dist /tmp/dist

RUN mkdir -p "/usr/share/nginx/html${STATIC_PREFIX}" \
  && cp -a /tmp/dist/. "/usr/share/nginx/html${STATIC_PREFIX}/" \
  && rm -rf /tmp/dist

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
