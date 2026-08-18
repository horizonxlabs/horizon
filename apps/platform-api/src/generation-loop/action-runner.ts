import { randomUUID } from "node:crypto";

import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import type { CheckpointStore } from "./checkpoint-store";
import type { MigrationStore } from "./migration-store";
import { containsTransactionControl } from "./migration-runner";
import { boundedExecution, boundedExecutionError } from "./action-execution-boundary";
import type { ActionResult, ActionRunner, RunnableAction } from "./action-runner-types";
import type { DatabaseMigrationResult } from "./action-runner-types";
import {
  runWorkspaceEditAction,
  runWorkspaceFileAction,
  shellQuote,
  workspaceWriteCommand
} from "./workspace-file-actions";
import { workspaceShellCleanupCommand, workspaceShellCommand } from "./workspace-shell-command";

export { applyFindReplace } from "./find-replace";
export type { ActionResult, ActionRunner, RunnableAction } from "./action-runner-types";

export function createActionRunner(deps: {
  docker: DockerEngine;
  checkpoints: CheckpointStore;
  migrations: MigrationStore;
  // Executes migration SQL against the project's real Postgres (via the container's
  // DATABASE_URL). Absent in memory/test mode, where migrations are only recorded.
  runMigrationSql?: (databaseUrl: string, sql: string) => Promise<void>;
  runMigrationBatchSql?: (databaseUrl: string, statements: string[]) => Promise<void>;
}): ActionRunner {
  const syncMigrationArtifacts = async (input: {
    containerId: string;
    projectId: string;
    actions: Array<Extract<RunnableAction, { type: "migration" }>>;
  }): Promise<ActionResult> => {
    try {
      const artifacts = new Map(
        (await deps.migrations.listMigrations(input.projectId)).map((migration) => [
          migration.name,
          migration.sql
        ])
      );
      for (const action of input.actions) artifacts.set(action.name, action.sql);
      if (artifacts.size === 0) return { ok: true, stdout: "" };

      const scripts: string[] = [];
      for (const [name, sql] of artifacts) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
          throw new Error(`migration name '${name}' is not safe for a workspace artifact`);
        }
        const encoded = Buffer.from(sql, "utf8").toString("base64");
        const migrationDir = `prisma/migrations/${name}`;
        const migrationFile = `${migrationDir}/migration.sql`;
        scripts.push(
          `mkdir -p ${shellQuote(migrationDir)} && echo ${encoded} | base64 -d > ${shellQuote(migrationFile)}`
        );
      }
      const result = await deps.docker.execInContainer(
        input.containerId,
        workspaceWriteCommand(scripts.join(" && "))
      );
      if (result.exitCode !== 0) {
        return {
          ok: false,
          error: "failed to materialize workspace migration artifacts",
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode
        };
      }
      return { ok: true, stdout: result.stdout };
    } catch (error) {
      return {
        ok: false,
        error: `migration artifact sync failed: ${(error as Error).message}`,
        stdout: "",
        stderr: (error as Error).message,
        exitCode: 1
      };
    }
  };

  const runMigrationBatch = async (input: {
    containerId: string;
    projectId: string;
    actions: Array<Extract<RunnableAction, { type: "migration" }>>;
    commitSha: string;
  }): Promise<DatabaseMigrationResult> => {
    let databaseMigrationOutcome: DatabaseMigrationResult["databaseMigrationOutcome"] =
      "not_applied";
    try {
      const statements = input.actions.map((action) => action.sql);
      if (statements.length === 0) {
        return { ok: true, stdout: "", databaseMigrationOutcome };
      }
      if (containsTransactionControl(statements)) {
        return {
          ok: false,
          error: "migration rejected: transaction control commands are not allowed",
          stdout: "",
          stderr: "",
          exitCode: 1,
          databaseMigrationOutcome
        };
      }
      if (deps.runMigrationBatchSql || deps.runMigrationSql) {
        const envResult = await deps.docker.execInContainer(input.containerId, [
          "sh",
          "-c",
          'printf %s "$DATABASE_URL"'
        ]);
        if (envResult.exitCode !== 0) {
          return {
            ok: false,
            error: "failed to read DATABASE_URL from the workspace container",
            stdout: "",
            stderr: envResult.stderr,
            exitCode: envResult.exitCode,
            databaseMigrationOutcome
          };
        }
        const databaseUrl = (envResult.stdout ?? "").trim();
        if (!databaseUrl) {
          return {
            ok: false,
            error: "DATABASE_URL is not set in the workspace container; cannot run migration",
            stdout: "",
            stderr: "",
            exitCode: 1,
            databaseMigrationOutcome
          };
        }
        databaseMigrationOutcome = "may_have_applied";
        if (deps.runMigrationBatchSql) {
          await deps.runMigrationBatchSql(databaseUrl, statements);
        } else {
          await deps.runMigrationSql!(databaseUrl, statements.join(";\n"));
        }
        databaseMigrationOutcome = "applied";
      }
      await deps.migrations.recordMigrations(
        input.actions.map((action) => ({
          projectId: input.projectId,
          name: action.name,
          sql: action.sql,
          commitSha: input.commitSha
        }))
      );
      return { ok: true, stdout: "", databaseMigrationOutcome };
    } catch (error) {
      return {
        ok: false,
        error: `migration failed: ${(error as Error).message}`,
        stdout: "",
        stderr: (error as Error).message,
        exitCode: 1,
        databaseMigrationOutcome
      };
    }
  };

  return {
    syncMigrationArtifacts,
    runMigrationBatch,
    async runAction(input) {
      const { action } = input;
      if (input.signal?.aborted) return boundedExecutionError("action aborted");

      if (action.type === "file") {
        if (!input.containerId) {
          return { ok: false, error: "missing containerId", stdout: "", stderr: "", exitCode: -1 };
        }
        return runWorkspaceFileAction({
          docker: deps.docker,
          containerId: input.containerId,
          template: input.template,
          action
        });
      }

      if (action.type === "edit") {
        if (!input.containerId) {
          return { ok: false, error: "missing containerId", stdout: "", stderr: "", exitCode: -1 };
        }
        return runWorkspaceEditAction({
          docker: deps.docker,
          containerId: input.containerId,
          template: input.template,
          action
        });
      }

      if (action.type === "shell") {
        const commandTimeoutMs = input.timeoutMs ?? 60_000;
        const actionToken = randomUUID();
        const cmd = workspaceShellCommand(action, commandTimeoutMs, actionToken);
        const terminateCmd = workspaceShellCleanupCommand(actionToken, {
          removeToken: false,
          waitForToken: true
        });
        const cleanupCmd = workspaceShellCleanupCommand(actionToken);
        const maxOutputBytes = input.maxOutputBytes ?? Number.MAX_SAFE_INTEGER;
        let actionResult: ActionResult | undefined;
        let executionError: unknown;
        try {
          // Stream the output live when the engine + caller support it; otherwise run buffered.
          if (input.onShellOutput && deps.docker.execInContainerStream) {
            let output = "";
            let collectedBytes = 0;
            const execution = deps.docker.execInContainerStream(input.containerId, cmd, (chunk) => {
              if (collectedBytes >= maxOutputBytes || input.signal?.aborted) return;
              const remaining = maxOutputBytes - collectedBytes;
              const bounded = Buffer.from(chunk, "utf8").subarray(0, remaining).toString("utf8");
              collectedBytes += Buffer.byteLength(bounded, "utf8");
              output += bounded;
              input.onShellOutput?.(bounded);
            });
            const bounded = await boundedExecution(
              execution,
              input.signal,
              commandTimeoutMs,
              async () => {
                const terminated = await deps.docker.execInContainer(
                  input.containerId,
                  terminateCmd
                );
                if (terminated.exitCode !== 0) {
                  throw new Error(
                    `workspace action boundary cleanup failed: ${(terminated.stderr || terminated.stdout).trim()}`
                  );
                }
              }
            );
            if (!bounded.ok) {
              actionResult = bounded.result;
            } else {
              const { exitCode } = bounded.value;
              actionResult =
                exitCode === 0
                  ? { ok: true, stdout: output }
                  : {
                      ok: false,
                      error: shellFailure(exitCode, output),
                      stdout: output,
                      stderr: "",
                      exitCode
                    };
            }
          } else {
            const execution = deps.docker.execInContainer(input.containerId, cmd);
            const bounded = await boundedExecution(
              execution,
              input.signal,
              commandTimeoutMs,
              async () => {
                const terminated = await deps.docker.execInContainer(
                  input.containerId,
                  terminateCmd
                );
                if (terminated.exitCode !== 0) {
                  throw new Error(
                    `workspace action boundary cleanup failed: ${(terminated.stderr || terminated.stdout).trim()}`
                  );
                }
              }
            );
            if (!bounded.ok) {
              actionResult = bounded.result;
            } else {
              const result = bounded.value;
              result.stdout = Buffer.from(result.stdout, "utf8")
                .subarray(0, maxOutputBytes)
                .toString("utf8");
              result.stderr = Buffer.from(result.stderr, "utf8")
                .subarray(0, maxOutputBytes)
                .toString("utf8");
              actionResult =
                result.exitCode === 0
                  ? { ok: true, stdout: result.stdout }
                  : {
                      ok: false,
                      error: shellFailure(result.exitCode, result.stderr || result.stdout),
                      stdout: result.stdout,
                      stderr: result.stderr,
                      exitCode: result.exitCode
                    };
            }
          }
        } catch (error) {
          executionError = error;
        }
        const cleanup = await deps.docker.execInContainer(input.containerId, cleanupCmd);
        if (cleanup.exitCode !== 0) {
          return {
            ok: false,
            error: `workspace action process cleanup failed: ${(cleanup.stderr || cleanup.stdout).trim()}`,
            stdout: actionResult?.stdout ?? "",
            stderr: cleanup.stderr,
            exitCode: cleanup.exitCode
          };
        }
        if (executionError) throw executionError;
        return actionResult ?? boundedExecutionError("workspace action returned no result");
      }

      return runMigrationBatch({
        containerId: input.containerId,
        projectId: input.projectId,
        actions: [action],
        commitSha: input.commitSha ?? ""
      });
    }
  };
}

function shellFailure(exitCode: number, output: string): string {
  const detail = output.trim();
  return detail
    ? `shell command exited ${exitCode}: ${detail}`
    : `shell command exited ${exitCode}`;
}
