import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import type { MigrationStore } from "../generation-loop/migration-store";
import type { GitPort } from "./git-port";

export type PrePublishResult = { ok: true } | { ok: false; failures: string[] };

export async function runPrePublishChecks(
  deps: { docker: DockerEngine; git: GitPort; migrations: MigrationStore },
  input: { projectId: string; slug: string; containerId: string; commitSha: string }
): Promise<PrePublishResult> {
  const failures: string[] = [];

  // Run the build via the project's package script so the toolchain (next/vite/etc.) resolves from
  // node_modules/.bin — invoking `next` directly fails with exit 127 (command not found).
  const build = await deps.docker.execInContainer(input.containerId, [
    "sh",
    "-c",
    "cd /workspace && npm run build"
  ]);
  if (build.exitCode !== 0) {
    failures.push(`build failed (exit ${build.exitCode}): ${build.stderr.trim()}`);
  }

  const filesAtCommit = await deps.git.listMigrationNames(input.projectId, input.commitSha);
  const applied = new Set(deps.migrations.listMigrations(input.projectId).map((m) => m.name));
  const pending = filesAtCommit.filter((name) => !applied.has(name));
  if (pending.length > 0) {
    failures.push(`pending migrations: ${pending.join(", ")}`);
  }

  const clean = await deps.git.isWorkingTreeClean(input.projectId);
  if (!clean) {
    failures.push("git working tree is not clean");
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
