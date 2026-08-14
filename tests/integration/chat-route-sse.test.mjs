import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createChatSseHandler } from "../../apps/platform-api/src/generation-loop/chat-route.ts";

const auth = {
  userId: "u1",
  roles: ["member"],
  projectIds: ["p1"],
  actor: { id: "u1", email: "creator@example.test", name: "Creator", role: "creator" }
};

function scriptedService(captured) {
  return {
    async history() {
      return [];
    },
    async listWorkspaceFiles() {
      return [];
    },
    async *runTurn(input) {
      captured.push(input);
      yield { type: "token", content: input.agentMode === "plan" ? "Plan ready" : "Built" };
      if (input.agentMode !== "plan") {
        yield {
          type: "action_result",
          actionId: "call-1",
          actionType: "file",
          label: "app/page.tsx",
          ok: true
        };
        yield { type: "commit", sha: "commit-sha-1" };
      }
      yield { type: "done" };
    }
  };
}

async function setup(resolveAuth, options = {}) {
  const captured = [];
  const handler = createChatSseHandler({
    generationService: options.generationService ?? scriptedService(captured),
    resolveAuth,
    resolveAttachmentContext: options.resolveAttachmentContext
  });
  const server = http.createServer((req, res) => {
    handler(req, res).catch((error) => {
      res.writeHead(500);
      res.end(String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, port: server.address().port, captured };
}

function postChat(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "content-type": "application/json" }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8")
          })
        );
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

test("authorized Build streams Creator SSE events", async () => {
  const { server, port } = await setup(() => auth);
  try {
    const raw = await postChat(port, "/projects/p1/chat", { prompt: "add home page" });
    assert.equal(raw.statusCode, 200);
    assert.match(raw.headers["content-type"], /text\/event-stream/);
    assert.match(raw.body, /event: token/);
    assert.match(raw.body, /event: action_result/);
    assert.match(raw.body, /event: commit/);
    assert.match(raw.body, /event: done/);
  } finally {
    server.close();
  }
});

test("Plan streams guidance without mutable events", async () => {
  const { server, port } = await setup(() => auth);
  try {
    const raw = await postChat(port, "/projects/p1/chat", {
      prompt: "plan update",
      agentMode: "plan"
    });
    assert.match(raw.body, /event: token/);
    assert.match(raw.body, /event: done/);
    assert.doesNotMatch(raw.body, /event: action_result|event: commit/);
  } finally {
    server.close();
  }
});

test("rejects missing session and non-member", async () => {
  const missing = await setup(() => null);
  const forbidden = await setup(() => auth);
  try {
    assert.equal(
      (await postChat(missing.port, "/projects/p1/chat", { prompt: "x" })).statusCode,
      401
    );
    assert.equal(
      (await postChat(forbidden.port, "/projects/p2/chat", { prompt: "x" })).statusCode,
      403
    );
  } finally {
    missing.server.close();
    forbidden.server.close();
  }
});

test("adds validated attachment excerpts to the governed prompt", async () => {
  const { server, port, captured } = await setup(() => auth, {
    resolveAttachmentContext: async () => ({
      versionIds: ["knsrc_upl_test_v1"],
      excerpts: ["Brand guide excerpt: use a teal logo."]
    })
  });
  try {
    await postChat(port, "/projects/p1/chat", {
      prompt: "Apply the guide",
      attachmentIds: ["upl_test"]
    });
    assert.match(captured[0].prompt, /Apply the guide/);
    assert.match(captured[0].prompt, /teal logo/);
    assert.match(captured[0].prompt, /upl_test/);
  } finally {
    server.close();
  }
});

test("client disconnect aborts the active generation turn", async () => {
  let capturedSignal;
  let resolveAborted;
  const aborted = new Promise((resolve) => {
    resolveAborted = resolve;
  });
  const generationService = {
    async history() {
      return [];
    },
    async listWorkspaceFiles() {
      return [];
    },
    async *runTurn(input) {
      capturedSignal = input.signal;
      if (input.signal.aborted) resolveAborted();
      else input.signal.addEventListener("abort", resolveAborted, { once: true });
      await aborted;
      yield { type: "done" };
    }
  };
  const { server, port } = await setup(() => auth, { generationService });
  try {
    await new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port, path: "/projects/p1/chat", method: "POST" },
        (res) =>
          res.once("data", () => {
            res.destroy();
            resolve();
          })
      );
      req.on("error", reject);
      req.end(JSON.stringify({ prompt: "Build" }));
    });
    await aborted;
    assert.equal(capturedSignal.aborted, true);
  } finally {
    server.close();
  }
});
