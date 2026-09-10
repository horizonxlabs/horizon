# docker/workspace-next.Dockerfile
# Dev-workspace image for AI-generated Next.js projects.
# EXPOSE only (the orchestrator never publishes host ports).
FROM node:22.22.0-alpine

# git is needed for checkpoint/version control, util-linux provides the kernel-backed flock
# transition lock, and curl is used for health checks.
RUN apk add --no-cache git curl util-linux && command -v flock >/dev/null

# All lock-state transitions flock this one image-owned inode. Runtime code must never replace it.
RUN touch /var/lock/evcp-turn-reclaim.lock && \
    chown root:root /var/lock/evcp-turn-reclaim.lock && \
    chmod 600 /var/lock/evcp-turn-reclaim.lock

# Non-root user for the workspace.
RUN addgroup -S evcp && adduser -S evcp -G evcp

WORKDIR /opt/evcp-template

# Seed the workspace with the golden template so a freshly-provisioned container
# has a runnable Next.js app before the AI writes anything.
COPY templates/nextjs-base/ /opt/evcp-template/

# Pin the template graph across image releases; bake a dependency-only cache stamp.
COPY docker/workspace-dependencies.cjs docker/workspace-dev.cjs /usr/local/lib/evcp/
RUN corepack enable && npm ci --no-audit --no-fund
RUN node /usr/local/lib/evcp/workspace-dependencies.cjs /opt/evcp-template

# The project volume is mounted at /workspace with NoCopy. The entrypoint hydrates only the small
# source/template files there and links this image-backed dependency tree for the common baseline.
RUN mkdir -p /workspace && chown -R evcp:evcp /opt/evcp-template /workspace
WORKDIR /workspace

# Mounted workspaces can contain files written by host-side tooling. Start as root only long
# enough to repair their ownership, then the entrypoint drops to the non-root workspace user.
COPY docker/workspace-entrypoint.sh /usr/local/bin/workspace-entrypoint
RUN chmod 755 /usr/local/bin/workspace-entrypoint

ENV EVCP_TURBOPACK_ROOT=/
EXPOSE 3000

CMD ["/usr/local/bin/workspace-entrypoint"]
