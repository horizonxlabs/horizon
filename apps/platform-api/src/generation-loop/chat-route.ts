import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkspaceChatTurnPart } from "@evcp/types";
import type { WorkspaceAuthContext } from "../workspace-orchestrator/routes";
import { resolveWorkspaceAgentMode } from "../workspace-agent-mode";
import { createErrorTag, isPlatformFile, type ErrorTag } from "./error-tags";
import type { GenerationService } from "./generation-service-types";
import type { ChatStreamEvent } from "./generation-types";
import { reduceTurnPart } from "./turn-parts";

type ReplayableTurnEvent = ChatStreamEvent | { type: "prd_version"; id: string; version: string; changeSummary: string } | { type: "bug_report"; bugs: unknown[] };

type ActiveTurn = {
  projectId: string;
  prompt: string;
  agentMode: string;
  events: ReplayableTurnEvent[];
  parts: WorkspaceChatTurnPart[];
  controller: AbortController;
  subscribers: Map<ServerResponse, () => void>;
  completion: Promise<void>;
};

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
}) {
  // A generation belongs to a project turn, not to the browser request that happened to start it.
  // Keeping the turn here lets a refreshed Creator UI discover and replay the active stream.
  const activeTurns = new Map<string, ActiveTurn>();

  function writeEvent(res: ServerResponse, event: ReplayableTurnEvent) {
    if (res.destroyed || res.writableEnded) return;
    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      // A subscriber can disappear at any point; the project turn must continue regardless.
    }
  }

  function subscribe(turn: ActiveTurn, res: ServerResponse) {
    res.flushHeaders?.();
    res.write(": open\n\n");
    for (const event of turn.events) writeEvent(res, event);
    const heartbeatIntervalMs =
      deps.heartbeatIntervalMs && deps.heartbeatIntervalMs > 0 ? deps.heartbeatIntervalMs : 15_000;
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(": keepalive\n\n");
    }, heartbeatIntervalMs);
    heartbeat.unref();
    const detach = () => {
      clearInterval(heartbeat);
      turn.subscribers.delete(res);
      res.off("close", detach);
    };
    turn.subscribers.set(res, detach);
    // Deliberately detach only. Browser refreshes must not cancel the server-owned turn.
    res.once("close", detach);
  }

  function finishSubscribers(turn: ActiveTurn) {
    for (const [res, detach] of turn.subscribers) {
      detach();
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  }

  function publish(turn: ActiveTurn, event: ReplayableTurnEvent) {
    if (event.type !== "prd_version" && event.type !== "bug_report") {
      turn.parts = reduceTurnPart(turn.parts, event);
    }
    turn.events.push(event);
    for (const res of turn.subscribers.keys()) writeEvent(res, event);
  }

  function startActiveTurn(input: {
    projectId: string;
    prompt: string;
    agentMode: string;
    approvedPlan?: string;
    actor: NonNullable<WorkspaceAuthContext["actor"]>;
  }): ActiveTurn {
    const controller = new AbortController();
    const turn = {
      projectId: input.projectId,
      prompt: input.prompt,
      agentMode: input.agentMode,
      events: [],
      parts: [],
      controller,
      subscribers: new Map<ServerResponse, () => void>(),
      completion: Promise.resolve()
    } satisfies ActiveTurn;
    turn.completion = (async () => {
      try {
        const turnErrors: string[] = [];
        let generationDone = false;
        let committed = false;
        for await (const event of deps.generationService.runTurn({
          projectId: input.projectId,
          prompt: input.prompt,
          agentMode: input.agentMode as "auto" | "build" | "plan",
          actor: input.actor,
          approvedPlan: input.approvedPlan,
          signal: controller.signal
        })) {
          if (event.type === "done") {
            generationDone = true;
            continue;
          }
          if (event.type === "commit") committed = true;
          if (event.type === "error") turnErrors.push(String(event.message ?? ""));
          publish(turn, event);
        }
        if (!generationDone) throw new Error("Generation stream ended before the done event");
        if (
          input.approvedPlan &&
          input.agentMode === "build" &&
          committed &&
          deps.recordPrdVersionFromPlan
        ) {
          try {
            publish(
              turn,
              { type: "prd_version", ...(await deps.recordPrdVersionFromPlan(input.actor, input.projectId, input.approvedPlan)) }
            );
          } catch {
            // Best effort metadata must never disturb a completed generation turn.
          }
        }
        if (committed) {
          const tags = await collectPostTurnTags(deps.generationService, input.projectId, turnErrors);
          for (const tag of tags) if (tag.platformBug) deps.onPlatformBug?.(input.projectId, tag);
          publish(turn, {
            type: "bug_report",
            bugs: tags.map((tag) => ({
              signature: tag.signature,
              source: tag.source,
              file: tag.file,
              message: tag.message.slice(0, 300),
              platformBug: Boolean(tag.platformBug)
            }))
          });
        }
      } catch (error) {
        publish(turn, { type: "error", message: (error as Error).message });
      } finally {
        publish(turn, { type: "done" });
        finishSubscribers(turn);
        activeTurns.delete(input.projectId);
      }
    })();
    activeTurns.set(input.projectId, turn);
    return turn;
  }

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

    // GET /projects/:id/chat/active — the Creator polls this after a refresh and replays the
    // buffered events into its in-progress assistant message. No model data is exposed outside
    // the existing project membership boundary.
    const activeMatch = (req.url ?? "").match(/^\/projects\/([^/]+)\/chat\/active(?:\?.*)?$/);
    if (activeMatch && req.method === "GET") {
      const projectId = activeMatch[1];
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
      const turn = activeTurns.get(projectId);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          turn
            ? {
                active: true,
                prompt: turn.prompt,
                agentMode: turn.agentMode,
                events: turn.events,
                parts: turn.parts
              }
            : { active: false }
        )
      );
      return;
    }

    // Explicit cancellation replaces the old implicit "connection closed = cancel" behavior.
    const cancelMatch = (req.url ?? "").match(/^\/projects\/([^/]+)\/chat\/cancel$/);
    if (cancelMatch && req.method === "POST") {
      const projectId = cancelMatch[1];
      const auth = await deps.resolveAuth(req);
      if (!auth || !isMember(auth, projectId)) {
        res.writeHead(auth ? 403 : 401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: auth ? "forbidden" : "unauthorized" }));
        return;
      }
      const turn = activeTurns.get(projectId);
      if (turn) turn.controller.abort();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ active: Boolean(turn), cancelled: Boolean(turn) }));
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
        await deps.generationService.restoreToCommit(projectId, String(parsed?.commitSha ?? ""));
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

    if (!auth.actor) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (activeTurns.has(projectId)) {
      res.writeHead(409, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "turn_in_progress" }));
      return;
    }

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      // Tell any buffering proxy (nginx/ingress) not to hold the stream — deliver events as flushed.
      "x-accel-buffering": "no"
    });
    const turn = startActiveTurn({ projectId, prompt, agentMode, approvedPlan, actor: auth.actor });
    subscribe(turn, res);
    await turn.completion;
  };
}
