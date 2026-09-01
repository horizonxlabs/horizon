import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const storage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window ??= {
  location: {
    pathname: "/creator/projects/project-1",
    href: "http://localhost/creator/projects/project-1"
  },
  localStorage: storage,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.window.localStorage ??= storage;

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { useVibeChat } =
  await import("../../apps/creator-web/src/features/workspace/use-vibe-chat.ts");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function historyResponse(messages) {
  return new Response(JSON.stringify({ messages }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function doneStreamResponse() {
  return new Response("event: done\ndata: {}\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

function HookHarness({ onValue }) {
  const value = useVibeChat({
    selectedProjectId: "project-1",
    promptDraft: "",
    setPromptDraft() {},
    selectedAttachmentIds: []
  });
  onValue(value);
  return React.createElement("output", { "data-status": value.vibeStatus }, value.vibeStatus);
}

test("loading persisted history renders the pending-question outcome", async () => {
  globalThis.fetch = async () =>
    historyResponse([
      { id: "u1", role: "user", content: "Deploy the app", actions: [] },
      {
        id: "a1",
        role: "assistant",
        content: "<question>Which region?\n- APAC\n- EMEA</question>",
        actions: []
      }
    ]);
  let latest;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(HookHarness, {
        onValue(value) {
          latest = value;
        }
      })
    );
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.equal(latest.vibeStatus, "Waiting for input");
  assert.equal(renderer.root.findByType("output").children.join(""), "Waiting for input");
  await act(async () => renderer.unmount());
});

test("a delayed history response cannot replace a newer live turn or regress Working", async () => {
  const history = deferred();
  const chat = deferred();
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/chat/history")) return history.promise;
    if (url.endsWith("/chat") && init.method === "POST") return chat.promise;
    return new Response("", { status: 404 });
  };
  let latest;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(HookHarness, {
        onValue(value) {
          latest = value;
        }
      })
    );
  });

  let turnPromise;
  await act(async () => {
    turnPromise = latest.handleVibeChat({ prompt: "Build the dashboard", mode: "plan" });
    await Promise.resolve();
  });
  assert.equal(latest.vibeStatus, "Working");
  assert.equal(latest.vibeMessages.at(-2).text, "Build the dashboard");

  await act(async () => {
    history.resolve(
      historyResponse([
        { id: "u-old", role: "user", content: "Old request", actions: [] },
        {
          id: "a-old",
          role: "assistant",
          content: "<question>Old pending question?</question>",
          actions: []
        }
      ])
    );
    await new Promise((resolve) => setImmediate(resolve));
  });
  assert.equal(latest.vibeStatus, "Working");
  assert.equal(latest.vibeMessages.at(-2).text, "Build the dashboard");

  await act(async () => {
    chat.resolve(doneStreamResponse());
    await turnPromise;
  });
  assert.equal(latest.vibeStatus, "Completed");
  await act(async () => renderer.unmount());
});

test("a failed live request keeps the service exception out of the chat transcript", async () => {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/chat/history")) return historyResponse([]);
    if (url.endsWith("/chat") && init.method === "POST") {
      return new Response("", { status: 503 });
    }
    return new Response("", { status: 404 });
  };
  let latest;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(HookHarness, {
        onValue(value) {
          latest = value;
        }
      })
    );
    await new Promise((resolve) => setImmediate(resolve));
  });

  await act(async () => {
    await latest.handleVibeChat({ prompt: "Build the dashboard", mode: "plan" });
  });
  assert.equal(latest.vibeStatus, "Failed");
  assert.equal(latest.vibeTechnicalDetails, "Chat request failed (503)");
  assert.doesNotMatch(JSON.stringify(latest.vibeMessages), /Chat request failed \(503\)/);
  await act(async () => renderer.unmount());
});
