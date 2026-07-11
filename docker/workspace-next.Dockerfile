# docker/workspace-next.Dockerfile
# Dev-workspace image for AI-generated Next.js projects.
# EXPOSE only (the orchestrator never publishes host ports).
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

# Mounted workspaces can contain files written by host-side tooling. Start as root only long
# enough to repair their ownership, then the entrypoint drops to the non-root workspace user.
COPY docker/workspace-entrypoint.sh /usr/local/bin/workspace-entrypoint
RUN chmod 755 /usr/local/bin/workspace-entrypoint

EXPOSE 3000

CMD ["/usr/local/bin/workspace-entrypoint"]
