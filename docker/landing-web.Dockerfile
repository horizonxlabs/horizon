FROM node:22.22.0-alpine AS builder

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/auth-sdk/package.json packages/auth-sdk/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/mock-data/package.json packages/mock-data/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/admin-web/package.json apps/admin-web/package.json
COPY apps/creator-web/package.json apps/creator-web/package.json
COPY apps/app-store-pwa/package.json apps/app-store-pwa/package.json
COPY apps/landing-web/package.json apps/landing-web/package.json
COPY scripts/quality/prepare-git-hooks.mjs scripts/quality/prepare-git-hooks.mjs

RUN corepack enable && pnpm install --frozen-lockfile

COPY packages packages
COPY apps/landing-web apps/landing-web

# NEXT_PUBLIC_* is inlined during the build, so the public origin must be supplied here as a
# build argument — setting it at runtime has no effect. The default below must match the
# fallback in apps/landing-web/src/shared/site-config.ts: an unset ARG substitutes as an empty
# string (not unset) once assigned to ENV, and "" defeats that file's `??` fallback, crashing
# `new URL(...)` in layout.tsx during the build.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:4103
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN pnpm --filter @evcp/landing-web build

FROM node:22.22.0-alpine AS runtime

WORKDIR /workspace
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

# Next's standalone output does not include static assets (.next/static) or the
# public/ directory by design — they must be copied in explicitly, or the server
# runs but serves a completely unstyled page with 404s for every CSS/JS chunk.
COPY --from=builder /workspace/apps/landing-web/.next/standalone ./
COPY --from=builder /workspace/apps/landing-web/.next/static ./apps/landing-web/.next/static
COPY --from=builder /workspace/apps/landing-web/public ./apps/landing-web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/" >/dev/null || exit 1

CMD ["node", "apps/landing-web/server.js"]
