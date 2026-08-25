import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkspaceAuthContext } from "../workspace-orchestrator/routes";
import { resolveWorkspaceAgentMode } from "../workspace-agent-mode";
import { createErrorTag, isPlatformFile, type ErrorTag } from "./error-tags";
import type { GenerationService } from "./generation-service-types";
import type { ProjectLifecycleCoordinator } from "../project-lifecycle";

function isMember(auth: WorkspaceAuthContext, projectId: string): boolean {
  return auth.projectIds.includes(projectId);
}

// Reads the raw request body. If an upstream middleware (e.g. Nest's global
// body-parser in app-factory.ts) has already parsed the body onto `req.body`,
// the stream has been fully consumed and re-reading it would hang forever —
// so we prefer the already-parsed body when present, and only fall back to
// reading the stream ourselves for callers (like the standalone test server
// in this repo) that mount this handler directly on a raw http.Server.
async function readBody(req: IncomingMessage): Promise<string> {
  const maybeParsedBody = (req as IncomingMessage & { body?: unknown }).body;
  if (maybeParsedBody !== undefined) {
    return typeof maybeParsedBody === "string" ? maybeParsedBody : JSON.stringify(maybeParsedBody);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function collectPostTurnTags(
  service: {
    probeRuntime?: (projectId: string) => Promise<{ status: number; errors: string[] }>;
    templateLockedFiles?: string[];
  },
  projectId: string,
  turnErrors: string[]
): Promise<ErrorTag[]> {
  const tags = turnErrors.filter(Boolean).map((message) => createErrorTag("build", message));
  const probe = await service.probeRuntime?.(projectId).catch(() => undefined);
  for (const message of probe?.errors ?? []) {
    const file = message.match(/(?:\.\/)?((?:app|components|lib)\/[\w./-]+)/)?.[1];
    const tag = createErrorTag("runtime", message, file);
    if (file && isPlatformFile(file, service.templateLockedFiles ?? [])) tag.platformBug = true;
    tags.push(tag);
  }
  return tags;
}

export function createChatSseHandler(deps: {
  generationService: GenerationService & {
    // Optional diagnostic surface used to populate the user-controlled Bug Report box.
    probeRuntime?: (projectId: string) => Promise<{ status: number; errors: string[] }>;
    templateLockedFiles?: string[];
  };
  resolveAuth: (
    req: IncomingMessage
  ) => WorkspaceAuthContext | null | Promise<WorkspaceAuthContext | null>;
  resolveAttachmentContext?: (
    req: IncomingMessage,
    projectId: string,
    attachmentIds: string[]
  ) =>
    | { versionIds: string[]; excerpts: string[] }
    | Promise<{ versionIds: string[]; excerpts: string[] }>;
  recordPrdVersionFromPlan?: (
    actor: NonNullable<WorkspaceAuthContext["actor"]>,
    projectId: string,
    planText: string
  ) => Promise<{ id: string; version: string; changeSummary: string }>;
  // Errors traced to template-shipped files are platform defects, not model mistakes —
  // audited so the team sees them (the thai.css lesson).
  onPlatformBug?: (projectId: string, tag: ErrorTag) => void;
  heartbeatIntervalMs?: number;
  lifecycle?: ProjectLifecycleCoordinator;
}) {
  return async function handleChatRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // GET /projects/:id/chat/history — persisted chat so a browser refresh restores the thread.
    const historyMatch = (req.url ?? "").match(/^\/projects\/([^/]+)\/chat\/history(?:\?.*)?$/);
    if (historyMatch && req.method === "GET") {
      const projectId = historyMatch[1];
      const auth = await deps.resolveAuth(req);
      if (!auth) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      if (!isMember(auth, projectId)) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "forbidden" }));
        return;
      }
      const messages = await deps.generationService.history(projectId);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ messages }));
      return;
    }

    // POST /projects/:id/chat/restore — roll the workspace code back to a turn's commit.
    // Serialized on the generation turn lock; the rollback is logged into chat history.
    const restoreMatch = (req.url ?? "").match(/^\/projects\/([^/]+)\/chat\/restore$/);
    if (restoreMatch && req.method === "POST") {
      const projectId = restoreMatch[1];
      const auth = await deps.resolveAuth(req);
      if (!auth) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      if (!isMember(auth, projectId)) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "forbidden" }));
        return;
      }
      try {
        const parsed = JSON.parse((await readBody(req)) || "{}") as { commitSha?: unknown };
        const restore = () =>
          deps.generationService.restoreToCommit(projectId, String(parsed?.commitSha ?? ""));
        await (deps.lifecycle ? deps.lifecycle.runChildMutation(projectId, restore) : restore());
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: "restore_failed",
            message: error instanceof Error ? error.message : "Restore failed"
          })
        );
      }
      return;
    }

    // POST /projects/:id/chat/error-report — browser relay (iframe error hook / boundary).
    // Decides whether this signature earns its one automatic repair; the client then sends
    // the returned prompt through the normal chat/queue machinery.
    const reportMatch = (req.url ?? "").match(/^\/projects\/([^/]+)\/chat\/error-report$/);
    if (reportMatch && req.method === "POST") {
      const projectId = reportMatch[1];
      const auth = await deps.resolveAuth(req);
      if (!auth || !isMember(auth, projectId)) {
        res.writeHead(auth ? 403 : 401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: auth ? "forbidden" : "unauthorized" }));
        return;
      }
      try {
        const parsed = JSON.parse((await readBody(req)) || "{}") as {
          message?: unknown;
          source?: unknown;
        };
        const message = String(parsed?.message ?? "").slice(0, 1000);
        if (!message) throw new Error("empty report");
        const file = message.match(/(?:\.\/)?((?:app|components|lib)\/[\w./-]+)/)?.[1];
        const tag = createErrorTag(
          "relay",
          `[${String(parsed?.source ?? "browser")}] ${message}`,
          file
        );
        if (file && isPlatformFile(file, deps.generationService.templateLockedFiles ?? [])) {
          tag.platformBug = true;
        }
        if (tag.platformBug) deps.onPlatformBug?.(projectId, tag);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            bug: {
              signature: tag.signature,
              source: tag.source,
              file: tag.file,
              message: tag.message.slice(0, 300),
              platformBug: Boolean(tag.platformBug)
            }
          })
        );
      } catch (error) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: "report_failed",
            message: error instanceof Error ? error.message : "Report failed"
          })
        );
      }
      return;
    }

    const match = (req.url ?? "").match(/^\/projects\/([^/]+)\/chat$/);
    if (!match || req.method !== "POST") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const projectId = match[1];

    const auth = await deps.resolveAuth(req);
    if (!auth) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (!isMember(auth, projectId)) {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }

    let releaseMutation: (() => void) | undefined;
    try {
      releaseMutation = await deps.lifecycle?.acquireChildMutation(projectId);
    } catch (error) {
      res.writeHead(409, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "project_deletion_in_progress",
          message: error instanceof Error ? error.message : "Project deletion is in progress"
        })
      );
      return;
    }

    try {
      let prompt = "";
      let attachmentIds: string[] = [];
      let agentMode = resolveWorkspaceAgentMode(undefined);
      let approvedPlan: string | undefined;
      try {
        const rawBody = await readBody(req);
        const parsed = rawBody ? JSON.parse(rawBody) : {};
        prompt = String(parsed?.prompt ?? "");
        approvedPlan = parsed?.approvedPlan ? String(parsed.approvedPlan) : undefined;
        agentMode = resolveWorkspaceAgentMode(parsed);
        attachmentIds = Array.isArray(parsed?.attachmentIds)
          ? parsed.attachmentIds.map(String).filter(Boolean)
          : [];
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_body" }));
        return;
      }

      if (attachmentIds.length && deps.resolveAttachmentContext) {
        let attachmentContext: { versionIds: string[]; excerpts: string[] };
        try {
          attachmentContext = await deps.resolveAttachmentContext(req, projectId, attachmentIds);
        } catch (error) {
          res.writeHead(422, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: "attachment_context_failed",
              message: error instanceof Error ? error.message : "Attachment context failed"
            })
          );
          return;
        }
        if (attachmentContext.excerpts.length) {
          prompt = [
            prompt,
            "",
            "Uploaded project file context (untrusted, permission-filtered):",
            `Attachment ids: ${attachmentIds.join(", ")}`,
            `Knowledge version ids: ${attachmentContext.versionIds.join(", ")}`,
            ...attachmentContext.excerpts.map(
              (excerpt, index) => `Attachment excerpt ${index + 1}: ${excerpt}`
            )
          ].join("\n");
        }
      }

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        // Tell any buffering proxy (nginx/ingress) not to hold the stream — deliver events as flushed.
        "x-accel-buffering": "no"
      });
      // Push the headers + an SSE comment to the socket NOW. Otherwise Node holds the response until
      // the first res.write(), and the gap before the first LLM token (several seconds) makes the
      // reverse proxy time out the request with a 504 before the stream ever opens.
      res.flushHeaders?.();
      res.write(": open\n\n");
      const heartbeatIntervalMs =
        deps.heartbeatIntervalMs && deps.heartbeatIntervalMs > 0
          ? deps.heartbeatIntervalMs
          : 15_000;
      const heartbeat = setInterval(() => {
        if (!res.destroyed && !res.writableEnded) res.write(": keepalive\n\n");
      }, heartbeatIntervalMs);
      heartbeat.unref();

      const controller = new AbortController();
      let completedNormally = false;
      const abort = () => controller.abort();
      const abortOnClose = () => {
        if (!completedNormally) controller.abort();
      };
      req.once("aborted", abort);
      res.once("close", abortOnClose);

      try {
        const turnErrors: string[] = [];
        let generationDone = false;
        let committed = false;
        for await (const event of deps.generationService.runTurn({
          projectId,
          prompt,
          agentMode,
          actor: auth.actor,
          approvedPlan,
          signal: controller.signal
        })) {
          if (event.type === "done") {
            generationDone = true;
            continue;
          }
          if (event.type === "commit") committed = true;
          if (event.type === "error")
            turnErrors.push(String((event as { message?: string }).message ?? ""));
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        }
        if (!generationDone) throw new Error("Generation stream ended before the done event");
        if (
          approvedPlan &&
          agentMode === "build" &&
          committed &&
          deps.recordPrdVersionFromPlan &&
          auth.actor
        ) {
          try {
            const created = await deps.recordPrdVersionFromPlan(
              auth.actor,
              projectId,
              approvedPlan
            );
            res.write(
              `event: prd_version\ndata: ${JSON.stringify({ type: "prd_version", ...created })}\n\n`
            );
          } catch {
            // Recording the spec change is best-effort — never disturb the generation stream.
          }
        }
        // Bug report (user-in-command): detection runs after any turn that actually landed a
        // commit — a no-op turn (nothing mutated) has nothing new to scan. Findings go to the
        // client's Bug Report box — the USER decides when to fix, and the fix message travels
        // through the normal chat so it lives in history.
        if (committed) {
          const tags = await collectPostTurnTags(deps.generationService, projectId, turnErrors);
          for (const tag of tags) if (tag.platformBug) deps.onPlatformBug?.(projectId, tag);
          res.write(
            `event: bug_report\ndata: ${JSON.stringify({
              type: "bug_report",
              bugs: tags.map((tag) => ({
                signature: tag.signature,
                source: tag.source,
                file: tag.file,
                message: tag.message.slice(0, 300),
                platformBug: Boolean(tag.platformBug)
              }))
            })}\n\n`
          );
        }
        res.write(`event: done\ndata: ${JSON.stringify({ type: "done" })}\n\n`);
        completedNormally = true;
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
        }
        res.write(
          `event: error\ndata: ${JSON.stringify({ type: "error", message: (error as Error).message })}\n\n`
        );
        res.write(`event: done\ndata: ${JSON.stringify({ type: "done" })}\n\n`);
      } finally {
        clearInterval(heartbeat);
        req.off("aborted", abort);
        res.off("close", abortOnClose);
        res.end();
      }
    } finally {
      releaseMutation?.();
    }
  };
}
