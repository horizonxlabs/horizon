import { createMemoryGitPort } from "../../apps/platform-api/src/publish/git-port.ts";
import { createMemoryDeploymentStore } from "../../apps/platform-api/src/publish/deployment-store.ts";
import { createMemoryHealthChecker } from "../../apps/platform-api/src/publish/health-checker.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createMemoryDockerEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-engine.ts";

export function buildPublishServiceDeps({ healthy = true } = {}) {
  const docker = createMemoryDockerEngine();
  docker.state.containers.push({
    containerId: "dev-c1",
    spec: { name: "evcp-ws-app" },
    status: "running"
  });
  const git = createMemoryGitPort({ p1: { clean: true, head: "sha1", migrationNames: {} } });
  const audits = [];
  return {
    docker,
    git,
    migrations: createMemoryMigrationStore(),
    deployments: createMemoryDeploymentStore(),
    health: createMemoryHealthChecker(healthy),
    resolveEnv: () => ({ DATABASE_URL: "postgres://x" }),
    getDevContainerId: () => "dev-c1",
    network: "evcp-internal",
    onAudit: (event) => audits.push(event),
    _audits: audits
  };
}
