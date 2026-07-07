import type { IncomingMessage, ServerResponse } from "node:http";
import type { WorkspaceAuthContext } from "../workspace-orchestrator/routes";
import type { createGenerationService } from "./generation-service";

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

export function createChatSseHandler(deps: {
  generationService: ReturnType<typeof createGenerationService>;
  resolveAuth: (req: IncomingMessage) => WorkspaceAuthContext | null | Promise<WorkspaceAuthContext | null>;
}) {
  return async function handleChatRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ messages: deps.generationService.history(projectId) }));
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
    try {
      const rawBody = await readBody(req);
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      prompt = String(parsed?.prompt ?? "");
    } catch {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid_body" }));
      return;
    }

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });

    try {
      for await (const event of deps.generationService.runTurn({ projectId, prompt })) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.write(`event: error\ndata: ${JSON.stringify({ type: "error", message: (error as Error).message })}\n\n`);
    } finally {
      res.end();
    }
  };
}
