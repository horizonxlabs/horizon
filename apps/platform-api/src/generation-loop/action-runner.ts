import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { isLockedFile } from "../workspace-orchestrator/template";
import type { CheckpointStore } from "./checkpoint-store";
import type { MigrationStore } from "./migration-store";
import { applyFindReplace } from "./find-replace";
import { containsTransactionControl } from "./migration-runner";
import { boundedExecution, boundedExecutionError } from "./action-execution-boundary";
import type { ActionResult, ActionRunner, RunnableAction } from "./action-runner-types";
import { workspaceShellCommand } from "./workspace-shell-command";

export { applyFindReplace };
export type { ActionResult, ActionRunner, RunnableAction } from "./action-runner-types";

function workspaceWriteCommand(script: string): string[] {
  return ["su", "-s", "/bin/sh", "evcp", "-c", script];
}

// Read the CURRENT file (base64, byte-safe), apply the fuzzy find/replace so untouched regions
// stay byte-for-byte identical, and write it back. Shared by the edit action and by the recovery
// path that reinterprets a leaked SEARCH/REPLACE block wrapped in a type="file" action.
async function applyEditToFile(
  docker: DockerEngine,
  containerId: string,
  filePath: string,
  find: string,
  replace: string
): Promise<ActionResult> {
  const read = await docker.execInContainer(containerId, [
    "sh",
    "-c",
    `base64 ${filePath} 2>/dev/null || echo __EVCP_MISSING__`
  ]);
  const raw = (read.stdout ?? "").trim();
  if (raw === "__EVCP_MISSING__" || raw === "") {
    return {
      ok: false,
      error: `cannot edit '${filePath}': file not found`,
      stdout: "",
      stderr: "",
      exitCode: -1
    };
  }
  const current = Buffer.from(raw, "base64").toString("utf8");
  const edited = applyFindReplace(current, find, replace);
  if (!edited.ok) {
    const detail =
      edited.reason === "not_found"
        ? "the SEARCH text was not found in the file (it must match the current file exactly)"
        : "the SEARCH text appears more than once; include more surrounding context so it is unique";
    return {
      ok: false,
      error: `edit of '${filePath}' failed: ${detail}`,
      stdout: "",
      stderr: "",
      exitCode: -1
    };
  }
  const encoded = Buffer.from(edited.content, "utf8").toString("base64");
  const result = await docker.execInContainer(
    containerId,
    workspaceWriteCommand(`echo ${encoded} | base64 -d > ${filePath}`)
  );
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

// A type="file" (whole-file) write to an EXISTING file larger than this is rejected and redirected
// to a surgical edit. Small files (routes, config, a compact page/component) are cheap to rewrite
// wholesale and weaker models do that far more reliably than a precise SEARCH/REPLACE — mirroring
// opencode's forgiving `write` tool — so only genuinely large files are forced through edits.
const WHOLE_FILE_REWRITE_LIMIT = 4000;

// The AI's edit format uses git-conflict-style markers (<<<<<<< SEARCH / ======= / >>>>>>> REPLACE).
// If such a marker leaks into content that gets written — a REPLACE body the model pasted with a
// stray "=======", or a whole-file write echoing a conflict-looking block — the file is committed
// with the marker and the app build fails with "Merge conflict marker encountered". Detect it and
// reject the write so the model regenerates clean content instead of shipping a broken file.
function conflictMarkerLine(text: string): string | undefined {
  return text.match(/^(?:<{7,}|={7,}|>{7,}|\|{7,})(?:[ \t].*)?$/m)?.[0];
}

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
        scripts.push(
          `mkdir -p prisma/migrations/${name} && echo ${encoded} | base64 -d > prisma/migrations/${name}/migration.sql`
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
  }): Promise<ActionResult> => {
    try {
      const statements = input.actions.map((action) => action.sql);
      if (containsTransactionControl(statements)) {
        return {
          ok: false,
          error: "migration rejected: transaction control commands are not allowed",
          stdout: "",
          stderr: "",
          exitCode: 1
        };
      }
      if (deps.runMigrationBatchSql || deps.runMigrationSql) {
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
        if (deps.runMigrationBatchSql) {
          await deps.runMigrationBatchSql(databaseUrl, statements);
        } else {
          await deps.runMigrationSql!(databaseUrl, statements.join(";\n"));
        }
      }
      await deps.migrations.recordMigrations(
        input.actions.map((action) => ({
          projectId: input.projectId,
          name: action.name,
          sql: action.sql,
          commitSha: input.commitSha
        }))
      );
      return { ok: true, stdout: "" };
    } catch (error) {
      return {
        ok: false,
        error: `migration failed: ${(error as Error).message}`,
        stdout: "",
        stderr: (error as Error).message,
        exitCode: 1
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
        if (isLockedFile(input.template, action.filePath)) {
          return {
            ok: false,
            error: `refusing to write locked file '${action.filePath}'`,
            stdout: "",
            stderr: "",
            exitCode: -1
          };
        }
        const marker = conflictMarkerLine(action.content);
        if (marker) {
          return {
            ok: false,
            error:
              `refusing to write '${action.filePath}': the content contains a git conflict ` +
              `marker ("${marker.slice(0, 12)}"). Emit clean file content with no ` +
              `<<<<<<< / ======= / >>>>>>> markers.`,
            stdout: "",
            stderr: "",
            exitCode: -1
          };
        }
        // Drift guard: a whole-file write to an already-substantial existing file is the #1 cause of
        // the model silently restyling unrelated code. Reject it and force a targeted edit. New
        // files and the tiny starter template fall under the threshold and pass through, so the
        // first build still works.
        if (input.containerId) {
          const sizeResult = await deps.docker.execInContainer(input.containerId, [
            "sh",
            "-c",
            `wc -c < ${action.filePath} 2>/dev/null || echo -1`
          ]);
          const size = Number.parseInt((sizeResult.stdout ?? "").trim(), 10);
          if (Number.isFinite(size) && size > WHOLE_FILE_REWRITE_LIMIT) {
            return {
              ok: false,
              error:
                `refusing to overwrite the existing file '${action.filePath}' (${size} bytes) with a whole-file write. ` +
                `To change an existing file use edit_workspace_file and target only the unique text ` +
                `that must change. write_workspace_file is only for creating new files.`,
              stdout: "",
              stderr: "",
              exitCode: -1
            };
          }
        }
        const encoded = Buffer.from(action.content, "utf8").toString("base64");
        const dir = action.filePath.includes("/")
          ? action.filePath.slice(0, action.filePath.lastIndexOf("/"))
          : ".";
        const script = `mkdir -p ${dir} && echo ${encoded} | base64 -d > ${action.filePath}`;
        if (!input.containerId) {
          return { ok: false, error: "missing containerId", stdout: "", stderr: "", exitCode: -1 };
        }
        const result = await deps.docker.execInContainer(
          input.containerId,
          workspaceWriteCommand(script)
        );
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
        const marker = conflictMarkerLine(action.replace);
        if (marker) {
          return {
            ok: false,
            error:
              `edit of '${action.filePath}' rejected: the REPLACE text contains a git conflict ` +
              `marker ("${marker.slice(0, 12)}"). Provide only the replacement code, with no ` +
              `<<<<<<< / ======= / >>>>>>> markers.`,
            stdout: "",
            stderr: "",
            exitCode: -1
          };
        }
        if (!input.containerId) {
          return { ok: false, error: "missing containerId", stdout: "", stderr: "", exitCode: -1 };
        }
        return applyEditToFile(
          deps.docker,
          input.containerId,
          action.filePath,
          action.find,
          action.replace
        );
      }

      if (action.type === "shell") {
        const cmd = workspaceShellCommand(action);
        const maxOutputBytes = input.maxOutputBytes ?? Number.MAX_SAFE_INTEGER;
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
          const bounded = await boundedExecution(execution, input.signal, input.timeoutMs);
          if (!bounded.ok) return bounded.result;
          const { exitCode } = bounded.value;
          if (exitCode !== 0) {
            return {
              ok: false,
              error: `shell command exited ${exitCode}`,
              stdout: output,
              stderr: "",
              exitCode
            };
          }
          return { ok: true, stdout: output };
        }
        const execution = deps.docker.execInContainer(input.containerId, cmd);
        const bounded = await boundedExecution(execution, input.signal, input.timeoutMs);
        if (!bounded.ok) return bounded.result;
        const result = bounded.value;
        result.stdout = Buffer.from(result.stdout, "utf8")
          .subarray(0, maxOutputBytes)
          .toString("utf8");
        result.stderr = Buffer.from(result.stderr, "utf8")
          .subarray(0, maxOutputBytes)
          .toString("utf8");
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

      return runMigrationBatch({
        containerId: input.containerId,
        projectId: input.projectId,
        actions: [action],
        commitSha: input.commitSha ?? ""
      });
    }
  };
}
