import type { MigrationStore } from "../generation-loop/migration-store";
import type { GitPort } from "./git-port";

export type PrePublishResult = { ok: true } | { ok: false; failures: string[] };

export async function runPrePublishChecks(
  deps: { git: GitPort; migrations: MigrationStore },
  input: { projectId: string; commitSha: string }
): Promise<PrePublishResult> {
  const failures: string[] = [];

  const filesAtCommit = await deps.git.listMigrationNames(input.projectId, input.commitSha);
  const appliedRecords = await deps.migrations.listMigrations(input.projectId);
  const applied = new Set(appliedRecords.map((m) => m.name));
  const targetMigrations = new Set(filesAtCommit);
  const pending = filesAtCommit.filter((name) => !applied.has(name));
  if (pending.length > 0) {
    failures.push(`pending migrations: ${pending.join(", ")}`);
  }
  const missingFromTarget = appliedRecords
    .filter((migration) => !targetMigrations.has(migration.name))
    .map((migration) => migration.name);
  if (missingFromTarget.length > 0) {
    failures.push(
      `rollback blocked: target commit predates applied migrations: ${missingFromTarget.join(", ")}. ` +
      "Restore a compatible database backup or deploy a forward-fix commit."
    );
  }

  const clean = await deps.git.isWorkingTreeClean(input.projectId);
  if (!clean) {
    failures.push("git working tree is not clean");
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
