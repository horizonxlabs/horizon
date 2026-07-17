import type { DockerEngine } from "../workspace-orchestrator/docker-engine";
import { isLockedFile, type GoldenTemplate } from "../workspace-orchestrator/template";
import type { CheckpointStore } from "./checkpoint-store";
import type { MigrationStore } from "./migration-store";
import { applyFindReplace } from "./find-replace";
import { parseEditBody } from "./generation-action-utils";
import { containsTransactionControl } from "./migration-runner";

export { applyFindReplace };

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
    return { ok: false, error: `cannot edit '${filePath}': file not found`, stdout: "", stderr: "", exitCode: -1 };
  }
  const current = Buffer.from(raw, "base64").toString("utf8");
  const edited = applyFindReplace(current, find, replace);
  if (!edited.ok) {
    const detail =
      edited.reason === "not_found"
        ? "the SEARCH text was not found in the file (it must match the current file exactly)"
        : "the SEARCH text appears more than once; include more surrounding context so it is unique";
    return { ok: false, error: `edit of '${filePath}' failed: ${detail}`, stdout: "", stderr: "", exitCode: -1 };
  }
  const encoded = Buffer.from(edited.content, "utf8").toString("base64");
  const result = await docker.execInContainer(containerId, [
    "sh",
    "-c",
    `echo ${encoded} | base64 -d > ${filePath}`
  ]);
  if (result.exitCode !== 0) {
    return { ok: false, error: "edit write failed", stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
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
    // For shell actions: called with each chunk of merged stdout/stderr as it streams.
    onShellOutput?: (chunk: string) => void;
  }): Promise<ActionResult>;
  runMigrationBatch(input: {
    containerId: string;
    projectId: string;
    actions: Array<Extract<RunnableAction, { type: "migration" }>>;
    commitSha: string;
  }): Promise<ActionResult>;
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
    runMigrationBatch,
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
        const marker = conflictMarkerLine(action.content);
        if (marker) {
          // Forgiving recovery (opencode-style): a weaker model frequently emits a SEARCH/REPLACE
          // edit but wraps it in a type="file" action, leaking the conflict markers into the file
          // body. If the content IS a parseable SEARCH/REPLACE block, apply it as a surgical edit
          // instead of failing — committing the raw markers would break the build.
          const recovered = parseEditBody(action.content);
          if (recovered.find && input.containerId) {
            return applyEditToFile(
              deps.docker,
              input.containerId,
              action.filePath,
              recovered.find,
              recovered.replace
            );
          }
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
                `To change an existing file you MUST use an <action type="edit"> with a SEARCH/REPLACE block that ` +
                `targets ONLY the lines to change and leaves the rest of the file identical. type="file" is only for ` +
                `creating new files.`,
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
        const cmd = ["sh", "-c", action.command];
        // Stream the output live when the engine + caller support it; otherwise run buffered.
        if (input.onShellOutput && deps.docker.execInContainerStream) {
          let output = "";
          const { exitCode } = await deps.docker.execInContainerStream(input.containerId, cmd, (chunk) => {
            output += chunk;
            input.onShellOutput?.(chunk);
          });
          if (exitCode !== 0) {
            return { ok: false, error: `shell command exited ${exitCode}`, stdout: output, stderr: "", exitCode };
          }
          return { ok: true, stdout: output };
        }
        const result = await deps.docker.execInContainer(input.containerId, cmd);
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
