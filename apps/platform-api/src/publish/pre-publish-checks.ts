import type { MigrationStore } from "../generation-loop/migration-store";
import type { GitPort } from "./git-port";

export type PrePublishResult = { ok: true } | { ok: false; failures: string[] };

export async function runPrePublishChecks(
  deps: { git: GitPort; migrations: MigrationStore },
  input: { projectId: string; commitSha: string }
): Promise<PrePublishResult> {
  const failures: string[] = [];

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
