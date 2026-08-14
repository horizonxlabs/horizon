import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const LIVE = process.env.EVCP_PI_LIVE_TEST === "1";
const baseUrl = (process.env.EVCP_PI_BASE_URL ?? "http://localhost:9801").replace(/\/$/, "");
const creatorToken = process.env.EVCP_PI_CREATOR_TOKEN;
const timeoutMs = Number(process.env.EVCP_PI_LIVE_TIMEOUT_MS ?? 900_000);

test(
  "Pi creates and updates Todo, then builds Sales Pipeline with migrations",
  { skip: !LIVE, timeout: timeoutMs * 3 },
  async (t) => {
    assert.ok(creatorToken, "EVCP_PI_CREATOR_TOKEN is required when EVCP_PI_LIVE_TEST=1");
    const suffix = randomUUID().slice(0, 8);
    const createdProjectIds = [];

    const todo = await createProject({
      name: `Pi Todo ${suffix}`,
      appType: "Productivity App",
      businessProblem: "Track personal and team tasks",
      targetDepartment: "Operations",
      intendedUsers: ["Employee", "Manager"],
      dataSensitivity: "internal"
    });
    createdProjectIds.push(todo.id);
    t.diagnostic(`Created Todo project: ${todo.id}`);
    await startWorkspace(todo.id, `pi-todo-${suffix}`);
    await buildAndVerify(
      todo.id,
      "Create a polished Todo List with add, complete, filter, and delete behavior using mock data."
    );
    await buildAndVerify(
      todo.id,
      "Add due dates and an overdue filter without removing existing behavior."
    );

    const sales = await createProject({
      name: `Pi Sales Pipeline ${suffix}`,
      appType: "CRM App",
      businessProblem: "Track leads and opportunities through sales stages",
      targetDepartment: "Sales",
      intendedUsers: ["Sales Representative", "Sales Manager"],
      dataSensitivity: "confidential"
    });
    createdProjectIds.push(sales.id);
    t.diagnostic(`Created Sales Pipeline project: ${sales.id}`);
    await startWorkspace(sales.id, `pi-sales-${suffix}`);
    await buildAndVerify(
      sales.id,
      "Create a Sales Pipeline with lead stages, opportunity values, a kanban view, and a database migration."
    );

    t.diagnostic(
      `Created project IDs (clean up after evidence capture): ${createdProjectIds.join(", ")}`
    );
  }
);

async function buildAndVerify(projectId, prompt) {
  const events = await streamChat(projectId, prompt);
  const error = events.find((event) => event.type === "error");
  assert.equal(error, undefined, `Pi turn failed: ${JSON.stringify(error?.data)}`);
  const commitIndex = events.findIndex((event) => event.type === "commit");
  const doneIndex = events.findIndex((event) => event.type === "done");
  assert.ok(commitIndex >= 0, `missing commit event for ${projectId}`);
  assert.ok(doneIndex > commitIndex, `done must follow commit for ${projectId}`);

  await api(`/projects/${encodeURIComponent(projectId)}/workspace/preview/refresh`, {
    method: "POST"
  });
  await waitForPreview(projectId);
}

async function createProject(input) {
  return api("/projects", { method: "POST", body: input }, 201);
}

async function startWorkspace(projectId, slug) {
  await api(
    `/projects/${encodeURIComponent(projectId)}/workspace/container`,
    { method: "POST", body: { projectId, slug } },
    [200, 201, 409]
  );
}

async function streamChat(projectId, prompt) {
  const response = await fetch(`${baseUrl}/projects/${encodeURIComponent(projectId)}/chat`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ prompt, agentMode: "build" }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (response.status !== 200) {
    assert.fail(`chat returned ${response.status}: ${await response.text()}`);
  }
  assert.ok(response.body, "chat response has no SSE body");

  const events = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const lines = frame.split("\n");
      const type = lines
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const raw = lines
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();
      if (!type || !raw) continue;
      let data = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        // Keep malformed provider output visible in the assertion diagnostics.
      }
      events.push({ type, data });
    }
    if (done) break;
  }
  return events;
}

async function waitForPreview(projectId) {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot;
  while (Date.now() < deadline) {
    lastSnapshot = await api(`/projects/${encodeURIComponent(projectId)}/workspace`);
    const preview = lastSnapshot?.preview;
    const status = preview?.status ?? (preview?.id && preview?.version ? "ready" : "pending");
    if (status === "ready") return lastSnapshot;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  assert.fail(`preview did not become ready for ${projectId}: ${JSON.stringify(lastSnapshot)}`);
}

async function api(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: headers(options.body !== undefined),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : {};
  const accepted = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  assert.ok(
    accepted.includes(response.status),
    `${options.method ?? "GET"} ${path} returned ${response.status}: ${raw}`
  );
  return body.data ?? body;
}

function headers(withJson = false) {
  return {
    authorization: `Bearer ${creatorToken}`,
    ...(withJson ? { "content-type": "application/json" } : {})
  };
}
