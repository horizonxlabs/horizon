import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultWorkspaceOrchestrator } from "../../apps/platform-api/src/workspace-orchestrator/factory.ts";
import { createDockerSocketEngine } from "../../apps/platform-api/src/workspace-orchestrator/docker-socket-engine.ts";
import { createContainerGitCommitter } from "../../apps/platform-api/src/generation-loop/container-git.ts";
import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";
import { createDockerGitPort } from "../../apps/platform-api/src/publish/git-port.ts";
import { createPublishService } from "../../apps/platform-api/src/publish/publish-service.ts";
import { createPrismaDeploymentStore } from "../../apps/platform-api/src/publish/prisma-deployment-store.ts";
import { rehydrateRunningDeployment } from "../../apps/platform-api/src/publish/deployment-rehydration.ts";
import { createPrismaAiGovernancePersistence } from "../../apps/platform-api/src/persistence/ai-governance-repositories.ts";
import { createPrismaWorkspaceRuntimeRecordStore } from "../../apps/platform-api/src/persistence/workspace-runtime-repository.ts";
import { VaultKvV2AiSecretStore } from "../../apps/platform-api/src/ai-governance/secret-store.ts";

const LIVE = process.env.EVCP_PUBLISH_LIVE === "1";

test(
  "real blue-green publish preserves healthy routing and supports restart-safe rollback",
  { skip: !LIVE },
  async () => {
    const env = { ...process.env, EVCP_WORKSPACE_REAL_ADAPTERS: "1" };
    const seed = Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
    const slug = `publish${seed}`;
    const projectId = `proj-${slug}`;
    const actorId = `usr-${slug}`;
    const secretStore = new VaultKvV2AiSecretStore({
      address: env.VAULT_ADDR,
      mount: env.VAULT_KV_MOUNT ?? "platform",
      tokenFile: env.VAULT_TOKEN_FILE
    });
    const { client } = await createPrismaAiGovernancePersistence(env.DATABASE_URL, secretStore);
    const runtimeStore = await createPrismaWorkspaceRuntimeRecordStore(env.DATABASE_URL);
    const orchestrator = createDefaultWorkspaceOrchestrator({ env });
    const docker = createDockerSocketEngine();
    let record;

    try {
      await client.platformUser.create({
        data: { id: actorId, email: `${slug}@example.test`, name: "Live Publisher" }
      });
      await client.project.create({
        data: {
          id: projectId,
          name: `Live Publish ${seed}`,
          status: "active",
          ownerUserId: actorId
        }
      });
      await orchestrator.hydrateRuntimeRecords(runtimeStore);
      record = await orchestrator.provisionWorkspace({ projectId, slug });

      const gitCommitter = createContainerGitCommitter(docker);
      await gitCommitter.prepare(record.containerId);
      await writeFile(docker, record.containerId, "app/page.tsx", pageSource("VERSION_A"));
      await gitCommitter.validate(record.containerId);
      const versionA = await gitCommitter.commit(record.containerId, "live publish version A");

      const deployments = await createPrismaDeploymentStore(env.DATABASE_URL);
      const git = createDockerGitPort(docker, async () => record.containerId);
      const health = dockerNetworkHealthChecker(docker, record.containerId);
      const service = createPublishService({
        docker,
        git,
        deployments,
        migrations: createMemoryMigrationStore(),
        health,
        resolveEnv: (id) => orchestrator.resolveEnv(id),
        getDevContainerId: async () => record.containerId,
        network: env.EVCP_WORKSPACE_NETWORK
      });

      const first = await service.publish({
        projectId,
        slug,
        environment: "production",
        publishedByUserId: actorId
      });
      assert.equal(first.ok, true);
      assert.equal(first.deployment.commitSha, versionA);
      assert.equal((await docker.inspectContainer(first.deployment.containerName))?.running, true);

      await writeFile(docker, record.containerId, "app/page.tsx", pageSource("VERSION_B"));
      await gitCommitter.validate(record.containerId);
      const versionB = await gitCommitter.commit(record.containerId, "live publish version B");
      const second = await service.publish({
        projectId,
        slug,
        environment: "production",
        publishedByUserId: actorId
      });
      assert.equal(second.ok, true);
      assert.equal(second.deployment.commitSha, versionB);

      await writeFile(
        docker,
        record.containerId,
        "app/api/health/route.ts",
        'export async function GET() { return new Response("unhealthy", { status: 503 }); }\n'
      );
      await gitCommitter.validate(record.containerId);
      await gitCommitter.commit(record.containerId, "live publish unhealthy version");
      const failed = await service.publish({
        projectId,
        slug,
        environment: "production",
        publishedByUserId: actorId
      });
      assert.equal(failed.ok, false);
      assert.equal(failed.reason, "health_failed");
      assert.equal(deployments.getCurrent(slug, "production")?.id, second.deployment.id);
      assert.equal((await docker.inspectContainer(second.deployment.containerName))?.running, true);

      const rollback = await service.publish({
        projectId,
        slug,
        environment: "production",
        commitSha: versionA,
        publishedByUserId: actorId
      });
      assert.equal(rollback.ok, true);
      assert.equal(rollback.deployment.commitSha, versionA);
      const rollbackBody = await curlFromContainer(
        docker,
        record.containerId,
        `http://${rollback.deployment.containerName}:3000/apps/${slug}`
      );
      assert.match(rollbackBody, /VERSION_A/);

      const restartedDeployments = await createPrismaDeploymentStore(env.DATABASE_URL);
      const rehydrated = await rehydrateRunningDeployment({
        deployments: restartedDeployments,
        docker,
        health,
        slug,
        environment: "production"
      });
      assert.equal(rehydrated?.id, rollback.deployment.id);
      assert.equal(rehydrated?.containerName, rollback.deployment.containerName);
    } finally {
      const rows = await client.workspaceDeploymentRevision
        .findMany({
          where: { projectId },
          orderBy: { createdAt: "asc" }
        })
        .catch(() => []);
      for (const row of rows) {
        if (!row.containerId) continue;
        await docker.stopContainer(row.containerId).catch(() => undefined);
        await docker.removeContainer(row.containerId).catch(() => undefined);
      }
      await client.workspaceDeploymentRevision
        .deleteMany({ where: { projectId } })
        .catch(() => undefined);
      await orchestrator.deleteWorkspace(projectId);
      await client.project.deleteMany({ where: { id: projectId } });
      await client.platformUser.deleteMany({ where: { id: actorId } });
      await client.$disconnect();
    }
  }
);

function pageSource(label) {
  return `export default function Page() { return <main>${label}</main>; }\n`;
}

async function writeFile(docker, containerId, path, content) {
  const encoded = Buffer.from(content).toString("base64");
  const result = await docker.execInContainer(containerId, [
    "sh",
    "-c",
    `printf '%s' '${encoded}' | base64 -d > /workspace/${path}`
  ]);
  assert.equal(result.exitCode, 0);
}

function dockerNetworkHealthChecker(docker, probeContainerId) {
  return {
    async check(url) {
      const result = await docker.execInContainer(probeContainerId, [
        "sh",
        "-c",
        `attempt=0; while [ "$attempt" -lt 15 ]; do curl -fsS '${url}' >/dev/null 2>&1 && exit 0; attempt=$((attempt + 1)); sleep 1; done; exit 1`
      ]);
      return result.exitCode === 0;
    }
  };
}

async function curlFromContainer(docker, probeContainerId, url) {
  const result = await docker.execInContainer(probeContainerId, ["curl", "-fsS", url]);
  assert.equal(result.exitCode, 0, result.stdout || result.stderr || "curl failed");
  return result.stdout;
}
