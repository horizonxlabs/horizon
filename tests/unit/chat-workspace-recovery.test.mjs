import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createChatSseHandler } from "../../apps/platform-api/src/generation-loop/chat-route.ts";

test("chat reconciles the workspace before starting a generation turn", async () => {
  const order = [];
  const handler = createChatSseHandler({
    resolveAuth: () => ({
      userId: "u1",
      roles: ["creator"],
      projectIds: ["p1"],
      actor: { id: "u1", email: "creator@example.test", name: "Creator", role: "creator" }
    }),
    prepareWorkspace: async (projectId) => order.push(`prepare:${projectId}`),
    generationService: {
      async history() {
        return [];
      },
      async listWorkspaceFiles() {
        return [];
      },
      async *runTurn() {
        order.push("turn");
        yield { type: "done" };
      }
    }
  });
  const server = http.createServer((req, res) => void handler(req, res));
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/projects/p1/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "build" })
    });
    await response.text();
    assert.equal(response.status, 200);
    assert.deepEqual(order, ["prepare:p1", "turn"]);
  } finally {
    server.close();
  }
});
