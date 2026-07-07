# docker/workspace-next.Dockerfile
# Dev-workspace image for AI-generated Next.js projects.
# Non-root, EXPOSE only (the orchestrator never publishes host ports).
FROM node:22-alpine

# git is needed for the checkpoint/version-control layer (Plan 7); curl/wget for health checks.
RUN apk add --no-cache git curl

# Non-root user for the workspace.
RUN addgroup -S evcp && adduser -S evcp -G evcp

WORKDIR /workspace

# Seed the workspace with the golden template so a freshly-provisioned container
# has a runnable Next.js app before the AI writes anything.
COPY templates/nextjs-base/ /workspace/

# Enable pnpm via corepack and install template dependencies.
# No lockfile is committed for the template, so plain npm install is used
# (pnpm install would fail without a lockfile in frozen-lockfile CI environments;
# here we just need a working node_modules for the dev server).
RUN corepack enable && npm install

# Ownership to the non-root user.
RUN chown -R evcp:evcp /workspace
USER evcp

EXPOSE 3000

# Default: ensure dependencies match the (possibly volume-persisted) package.json — so a new
# dependency such as `pg`, or one the AI adds, is installed even when a pre-existing workspace
# volume shadows the image's node_modules — then run the dev server on all interfaces on 3000.
# The install is best-effort (|| true) so the dev server still starts if the registry is briefly
# unreachable and node_modules is already populated.
CMD ["sh", "-lc", "npm install --no-audit --no-fund --prefer-offline >/dev/null 2>&1 || true; npm run dev -- --hostname 0.0.0.0 --port 3000 || npx next dev --hostname 0.0.0.0 --port 3000"]
