import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureVibeWorkspace,
  streamVibeChat
} from "../../apps/creator-web/src/features/workspace/api.ts";

function browserWindow() {
  return {
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    },
    location: { port: "" }
  };
}

test("chat transport rejects an EOF that arrives before the terminal done event", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = browserWindow();
  globalThis.fetch = async () =>
    new Response('event: token\ndata: {"type":"token","content":"partial"}\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });

  try {
    await assert.rejects(
      streamVibeChat("p1", "Build", [], "build", () => undefined),
      /ended before the terminal done event/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("chat transport passes the caller cancellation signal to fetch", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const controller = new AbortController();
  let receivedSignal;
  globalThis.window = browserWindow();
  globalThis.fetch = async (_url, init) => {
    receivedSignal = init?.signal;
    return new Response('event: done\ndata: {"type":"done"}\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    });
  };

  try {
    await streamVibeChat("p1", "Build", [], "build", () => undefined, undefined, controller.signal);
    assert.equal(receivedSignal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("workspace provisioning uses the same cancellation signal", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const controller = new AbortController();
  let receivedSignal;
  globalThis.window = browserWindow();
  globalThis.fetch = async (_url, init) => {
    receivedSignal = init?.signal;
    return new Response(JSON.stringify({ data: { workspace: { state: "running" } } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    await ensureVibeWorkspace("p1", controller.signal);
    assert.equal(receivedSignal, controller.signal);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("chat transport rejects data frames sent after the terminal done event", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = browserWindow();
  globalThis.fetch = async () =>
    new Response(
      [
        'event: done\ndata: {"type":"done"}\n\n',
        'event: token\ndata: {"type":"token","content":"late"}\n\n'
      ].join(""),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );

  try {
    await assert.rejects(
      streamVibeChat("p1", "Build", [], "build", () => undefined),
      /received an event after the terminal done event/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("chat transport parses CRLF frames split across network chunks", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const encoder = new TextEncoder();
  const received = [];
  globalThis.window = browserWindow();
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('event: token\r\ndata: {"type":"token","content":"hel')
          );
          controller.enqueue(
            encoder.encode('lo"}\r\n\r\nevent: done\r\ndata: {"type":"done"}\r\n\r\n')
          );
          controller.close();
        }
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } }
    );

  try {
    await streamVibeChat("p1", "Build", [], "build", (type, data) => {
      received.push({ type, data });
    });
    assert.deepEqual(
      received.map((event) => event.type),
      ["token", "done"]
    );
    assert.equal(received[0].data.content, "hello");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
