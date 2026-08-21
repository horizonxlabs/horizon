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
    resolveAttachmentContext: options.resolveAttachmentContext,
    recordPrdVersionFromPlan: options.recordPrdVersionFromPlan,
    heartbeatIntervalMs: options.heartbeatIntervalMs
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

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) })
        );
      })
      .on("error", reject);
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

test("done is the terminal SSE event after all post-turn metadata", async () => {
  const { server, port } = await setup(() => auth, {
    recordPrdVersionFromPlan: async () => ({
      id: "prd-1",
      version: "1.0",
      changeSummary: "Approved home page"
    })
  });
  try {
    const raw = await postChat(port, "/projects/p1/chat", {
      prompt: "add home page",
      agentMode: "build",
      approvedPlan: "Build the approved home page"
    });
    const eventNames = [...raw.body.matchAll(/^event: ([^\n]+)$/gm)].map((match) => match[1]);

    assert.equal(eventNames.at(-1), "done");
    assert.ok(eventNames.includes("prd_version"));
    assert.ok(eventNames.includes("bug_report"));
    assert.ok(eventNames.indexOf("prd_version") < eventNames.indexOf("done"));
    assert.ok(eventNames.indexOf("bug_report") < eventNames.indexOf("done"));
  } finally {
    server.close();
  }
});

test("long-running turns emit SSE heartbeat comments before completion", async () => {
  const generationService = {
    async history() {
      return [];
    },
    async listWorkspaceFiles() {
      return [];
    },
    async *runTurn() {
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield { type: "done" };
    }
  };
  const { server, port } = await setup(() => auth, {
    generationService,
    heartbeatIntervalMs: 5
  });
  try {
    const raw = await postChat(port, "/projects/p1/chat", { prompt: "wait" });
    assert.match(raw.body, /: keepalive\n\n/);
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

test("approve-plan turn with no net mutation skips PRD recording and post-turn scanning", async () => {
  let prdRecorded = 0;
  let postTurnScans = 0;
  const generationService = {
    async history() {
      return [];
    },
    async listWorkspaceFiles() {
      return [];
    },
    async probeRuntime() {
      postTurnScans += 1;
      return { status: 200, errors: [] };
    },
    async *runTurn() {
      // No commit event — the turn produced zero net diff (e.g. the plan was already applied).
      yield { type: "token", content: "Nothing to change." };
      yield { type: "done" };
    }
  };
  const { server, port } = await setup(() => auth, {
    generationService,
    recordPrdVersionFromPlan: async () => {
      prdRecorded += 1;
      return { id: "prd-1", version: "1.0", changeSummary: "Approved home page" };
    }
  });
  try {
    const raw = await postChat(port, "/projects/p1/chat", {
      prompt: "add home page",
      agentMode: "build",
      approvedPlan: "Build the approved home page"
    });
    const eventNames = [...raw.body.matchAll(/^event: ([^\n]+)$/gm)].map((match) => match[1]);
    assert.equal(prdRecorded, 0);
    assert.equal(postTurnScans, 0);
    assert.equal(eventNames.some((name) => name === "prd_version"), false);
    assert.equal(eventNames.some((name) => name === "bug_report"), false);
    assert.equal(eventNames.at(-1), "done");
  } finally {
    server.close();
  }
});

test("Auto turns that stream no commit emit no commit event and skip post-turn scanning", async () => {
  let postTurnScans = 0;
  const generationService = {
    async history() {
      return [];
    },
    async listWorkspaceFiles() {
      return [];
    },
    async probeRuntime() {
      postTurnScans += 1;
      return { status: 200, errors: [] };
    },
    async *runTurn() {
      yield { type: "token", content: "Sure, here's what this app does." };
      yield { type: "done" };
    }
  };
  const { server, port } = await setup(() => auth, { generationService });
  try {
    const raw = await postChat(port, "/projects/p1/chat", {
      prompt: "what does this app do?",
      agentMode: "auto"
    });
    const eventNames = [...raw.body.matchAll(/^event: ([^\n]+)$/gm)].map((match) => match[1]);
    assert.equal(eventNames.some((name) => name === "commit"), false);
    assert.equal(eventNames.some((name) => name === "bug_report"), false);
    assert.equal(postTurnScans, 0);
  } finally {
    server.close();
  }
});

test("Auto turns that land a commit run post-turn scanning regardless of mode", async () => {
  let postTurnScans = 0;
  const generationService = {
    async history() {
      return [];
    },
    async listWorkspaceFiles() {
      return [];
    },
    async probeRuntime() {
      postTurnScans += 1;
      return { status: 200, errors: [] };
    },
    async *runTurn() {
      yield { type: "token", content: "Added the home page." };
      yield { type: "commit", sha: "commit-sha-auto" };
      yield { type: "done" };
    }
  };
  const { server, port } = await setup(() => auth, { generationService });
  try {
    const raw = await postChat(port, "/projects/p1/chat", {
      prompt: "add a home page",
      agentMode: "auto"
    });
    const eventNames = [...raw.body.matchAll(/^event: ([^\n]+)$/gm)].map((match) => match[1]);
    assert.ok(eventNames.includes("commit"));
    assert.ok(eventNames.includes("bug_report"));
    assert.equal(postTurnScans, 1);
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

test("client disconnect preserves the active generation turn for a refreshed Creator UI", async () => {
  let capturedSignal;
  let resolveTurn;
  const turnCanFinish = new Promise((resolve) => {
    resolveTurn = resolve;
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
      yield { type: "token", content: "Drafting the update." };
      yield {
        type: "action_start",
        actionId: "call-active-1",
        actionType: "file",
        label: "app/page.tsx"
      };
      await turnCanFinish;
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
    const active = await getJson(port, "/projects/p1/chat/active");
    assert.equal(capturedSignal.aborted, false);
    assert.equal(active.statusCode, 200);
    assert.equal(active.body.active, true);
    assert.equal(active.body.prompt, "Build");
    assert.deepEqual(active.body.parts, [
      { id: "text-1", type: "text", sequence: 1, text: "Drafting the update." },
      {
        id: "call-active-1",
        type: "tool",
        sequence: 2,
        tool: { actionType: "file", label: "app/page.tsx", status: "running" }
      }
    ]);
    resolveTurn();
  } finally {
    server.close();
  }
});
