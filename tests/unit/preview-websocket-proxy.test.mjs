import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { registerPreviewWebSocketProxy } from "../../apps/platform-api/src/workspace-orchestrator/preview-websocket-proxy.ts";

async function harness(resolveDecision) {
  const requests = [];
  const sockets = new Set();
  const upstream = http.createServer();
  upstream.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  upstream.on("upgrade", (request, socket, head) => {
    requests.push({ url: request.url, headers: request.headers, socket });
    socket.on("error", () => {});
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nREADY"
    );
    if (head.length) socket.write(head);
    socket.on("data", (data) => socket.write(data));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const server = http.createServer((_request, response) => response.end("Preview HTML"));
  const decisions = [];
  const proxy = registerPreviewWebSocketProxy(server, async (headers, key) => {
    decisions.push({ headers, key });
    return resolveDecision
      ? resolveDecision(headers, key)
      : {
          upstream: `http://127.0.0.1:${upstream.address().port}`,
          previewBase: "/preview/logical"
        };
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    upstream,
    requests,
    decisions,
    proxy,
    async close() {
      proxy.stop();
      for (const socket of sockets) socket.destroy();
      await Promise.all([
        new Promise((r) => server.close(r)),
        new Promise((r) => upstream.close(r))
      ]);
    }
  };
}

function connect(
  server,
  { path = "/preview/physical/_next/webpack-hmr?clientId=1", headers = {}, head = "" } = {}
) {
  const port = server.address().port;
  const socket = net.connect(port, "127.0.0.1");
  let received = "";
  socket.on("data", (chunk) => {
    received += chunk;
  });
  socket.on("error", () => {});
  socket.once("connect", () =>
    socket.write(
      [
        `GET ${path} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
        "",
        head
      ].join("\r\n")
    )
  );
  return {
    socket,
    read: () => received,
    async until(text) {
      if (received.includes(text)) return received;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Missing ${text}: ${received}`));
        }, 1500);
        const check = () => {
          if (received.includes(text)) {
            cleanup();
            resolve(received);
          }
        };
        const cleanup = () => {
          clearTimeout(timer);
          socket.off("data", check);
        };
        socket.on("data", check);
      });
    }
  };
}

test("preview receives later HMR updates without HTTP reload, preserving upgrade data in both directions", async () => {
  const fixture = await harness();
  const client = connect(fixture.server, {
    headers: {
      Cookie: "evcp_preview_token=fixture%2Btoken; other=private",
      Authorization: "Bearer old"
    },
    head: "EARLY_CLIENT_DATA"
  });
  try {
    await client.until("READY");
    await client.until("EARLY_CLIENT_DATA");
    assert.equal(fixture.decisions[0].headers.authorization, "Bearer fixture+token");
    assert.equal(fixture.decisions[0].key, "physical");
    assert.equal(fixture.requests[0].url, "/preview/logical/_next/webpack-hmr?clientId=1");
    assert.equal(fixture.requests[0].headers.cookie, undefined);
    assert.equal(fixture.requests[0].headers.authorization, undefined);
    fixture.requests[0].socket.write("APP_CHANGED_AFTER_INITIAL_RENDER");
    await client.until("APP_CHANGED_AFTER_INITIAL_RENDER");
    client.socket.write("CLIENT_SUBSCRIBED");
    await client.until("CLIENT_SUBSCRIBED");
    assert.equal(fixture.requests.length, 1, "the original live connection delivers the update");
  } finally {
    client.socket.destroy();
    await fixture.close();
  }
});

for (const status of [401, 403, 404, 503]) {
  test(`preview upgrade honors project authorization failure ${status}`, async () => {
    const fixture = await harness(() => ({ status }));
    const client = connect(fixture.server);
    try {
      await client.until(`HTTP/1.1 ${status}`);
      assert.equal(fixture.requests.length, 0);
    } finally {
      client.socket.destroy();
      await fixture.close();
    }
  });
}

for (const [name, options, status] of [
  ["cross-origin browser", { headers: { Origin: "https://untrusted.example" } }, 403],
  ["invalid origin", { headers: { Origin: "null" } }, 403],
  ["malformed preview cookie", { headers: { Cookie: "evcp_preview_token=%invalid" } }, 401],
  ["unrelated WebSocket path", { path: "/admin/socket" }, 404]
]) {
  test(`rejects ${name} before resolving a workspace`, async () => {
    const fixture = await harness();
    const client = connect(fixture.server, options);
    try {
      await client.until(`HTTP/1.1 ${status}`);
      assert.equal(fixture.decisions.length, 0);
      assert.equal(fixture.requests.length, 0);
    } finally {
      client.socket.destroy();
      await fixture.close();
    }
  });
}

test("same-origin browser connects and shutdown closes live tunnels", async () => {
  const fixture = await harness();
  const client = connect(fixture.server, {
    headers: { Origin: `http://127.0.0.1:${fixture.server.address().port}` }
  });
  try {
    await client.until("READY");
    const closed = once(client.socket, "close");
    fixture.proxy.stop();
    await closed;
    assert.equal(fixture.server.listenerCount("upgrade"), 0);
  } finally {
    client.socket.destroy();
    await fixture.close();
  }
});

test("unreachable workspace ends the handshake with a retryable error", async () => {
  const fixture = await harness(() => ({ upstream: "http://127.0.0.1:1" }));
  const client = connect(fixture.server);
  try {
    await client.until("HTTP/1.1 503");
  } finally {
    client.socket.destroy();
    await fixture.close();
  }
});
