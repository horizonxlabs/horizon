import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { isLockedFile, type GoldenTemplate } from "../workspace-orchestrator/template";
import type { CheckpointStore } from "./checkpoint-store";
import type { MigrationStore } from "./migration-store";
import { applyFindReplace } from "./find-replace";

export { applyFindReplace };

export type RunnableAction =
  | { id: string; type: "file"; filePath: string; content: string }
  | { id: string; type: "edit"; filePath: string; find: string; replace: string }
  | { id: string; type: "shell"; command: string }
  | { id: string; type: "migration"; name: string; sql: string };

export type ActionResult =
  | { ok: true; stdout: string }
  | { ok: false; error: string; stdout: string; stderr: string; exitCode: number };

export interface ActionRunner {
  runAction(input: {
    containerId: string;
    projectId: string;
    template: GoldenTemplate;
    action: RunnableAction;
    commitSha?: string;
  }): Promise<ActionResult>;
}

export function createActionRunner(deps: {
  docker: DockerEngine;
  checkpoints: CheckpointStore;
  migrations: MigrationStore;
  // Executes migration SQL against the project's real Postgres (via the container's
  // DATABASE_URL). Absent in memory/test mode, where migrations are only recorded.
  runMigrationSql?: (databaseUrl: string, sql: string) => Promise<void>;
}): ActionRunner {
  return {
    async runAction(input) {
      const { action } = input;

      if (action.type === "file") {
        if (isLockedFile(input.template, action.filePath)) {
          return {
            ok: false,
            error: `refusing to write locked file '${action.filePath}'`,
            stdout: "",
            stderr: "",
            exitCode: -1
          };
        }
        const encoded = Buffer.from(action.content, "utf8").toString("base64");
        const dir = action.filePath.includes("/")
          ? action.filePath.slice(0, action.filePath.lastIndexOf("/"))
          : ".";
        const script = `mkdir -p ${dir} && echo ${encoded} | base64 -d > ${action.filePath}`;
        if (!input.containerId) {
          return { ok: false, error: "missing containerId", stdout: "", stderr: "", exitCode: -1 };
        }
        const result = await deps.docker.execInContainer(input.containerId, ["sh", "-c", script]);
        if (result.exitCode !== 0) {
          return {
            ok: false,
            error: "file write failed",
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode
          };
        }
        return { ok: true, stdout: result.stdout };
      }

      if (action.type === "edit") {
        if (isLockedFile(input.template, action.filePath)) {
          return {
            ok: false,
            error: `refusing to edit locked file '${action.filePath}'`,
            stdout: "",
            stderr: "",
            exitCode: -1
          };
        }
        if (!input.containerId) {
          return { ok: false, error: "missing containerId", stdout: "", stderr: "", exitCode: -1 };
        }
        // Read the CURRENT file (base64, byte-safe) so untouched regions stay byte-for-byte identical.
        const read = await deps.docker.execInContainer(input.containerId, [
          "sh",
          "-c",
          `base64 ${action.filePath} 2>/dev/null || echo __EVCP_MISSING__`
        ]);
        const raw = (read.stdout ?? "").trim();
        if (raw === "__EVCP_MISSING__" || raw === "") {
          return {
            ok: false,
            error: `cannot edit '${action.filePath}': file not found`,
            stdout: "",
            stderr: "",
            exitCode: -1
          };
        }
        const current = Buffer.from(raw, "base64").toString("utf8");
        const edited = applyFindReplace(current, action.find, action.replace);
        if (!edited.ok) {
          const detail =
            edited.reason === "not_found"
              ? "the SEARCH text was not found in the file (it must match the current file exactly)"
              : "the SEARCH text appears more than once; include more surrounding context so it is unique";
          return {
            ok: false,
            error: `edit of '${action.filePath}' failed: ${detail}`,
            stdout: "",
            stderr: "",
            exitCode: -1
          };
        }
        const encoded = Buffer.from(edited.content, "utf8").toString("base64");
        const result = await deps.docker.execInContainer(input.containerId, [
          "sh",
          "-c",
          `echo ${encoded} | base64 -d > ${action.filePath}`
        ]);
        if (result.exitCode !== 0) {
          return {
            ok: false,
            error: "edit write failed",
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode
          };
        }
        return { ok: true, stdout: result.stdout };
      }

      if (action.type === "shell") {
        const result = await deps.docker.execInContainer(input.containerId, [
          "sh",
          "-c",
          action.command
        ]);
        if (result.exitCode !== 0) {
          return {
            ok: false,
            error: `shell command exited ${result.exitCode}`,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode
          };
        }
        return { ok: true, stdout: result.stdout };
      }

      // migration — execute the SQL against the project's real Postgres schema, then record it.
      if (deps.runMigrationSql) {
        const envResult = await deps.docker.execInContainer(input.containerId, [
          "sh",
          "-c",
          'printf %s "$DATABASE_URL"'
        ]);
        const databaseUrl = (envResult.stdout ?? "").trim();
        if (!databaseUrl) {
          return {
            ok: false,
            error: "DATABASE_URL is not set in the workspace container; cannot run migration",
            stdout: "",
            stderr: "",
            exitCode: 1
          };
        }
        try {
          await deps.runMigrationSql(databaseUrl, action.sql);
        } catch (error) {
          return {
            ok: false,
            error: `migration failed: ${(error as Error).message}`,
            stdout: "",
            stderr: (error as Error).message,
            exitCode: 1
          };
        }
      }
      deps.migrations.recordMigration({
        projectId: input.projectId,
        name: action.name,
        sql: action.sql,
        commitSha: input.commitSha ?? ""
      });
      return { ok: true, stdout: "" };
    }
  };
}
