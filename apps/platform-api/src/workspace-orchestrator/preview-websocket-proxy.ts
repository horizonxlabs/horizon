import { request, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";
import type { HeaderBag } from "../platform-http-types";
import { previewRequestHeaders, rewritePreviewForwardPath } from "./preview-proxy-support";

type Decision = { status: number } | { upstream: string; previewBase?: string };

// Express HTTP routes never receive Node's upgrade event. HMR needs a separate,
// authenticated tunnel or the iframe stays on its first render until refreshed.
export function registerPreviewWebSocketProxy(
  server: Server,
  resolve: (headers: HeaderBag, key: string) => Promise<Decision>
): { stop(): void } {
  const connections = new Set<Duplex>();
  const upgrade = (incoming: IncomingMessage, client: Duplex, head: Buffer) => {
    const reject = (status: number) => {
      if (!client.destroyed) {
        client.end(
          `HTTP/1.1 ${status} Preview unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
          () => client.destroy()
        );
      }
    };
    client.on("error", () => client.destroy());
    const match = incoming.url?.match(/^\/preview\/([^/?]+)\/_next\/webpack-hmr(?:\?.*)?$/);
    if (!match) return reject(404);
    if (incoming.method !== "GET" || incoming.headers.upgrade?.toLowerCase() !== "websocket") {
      return reject(400);
    }
    // WebSockets do not use CORS. Only accept browser handshakes from this host;
    // non-browser clients still have to pass the same project authorization.
    if (incoming.headers.origin) {
      try {
        const origin = new URL(incoming.headers.origin);
        if (
          !["http:", "https:"].includes(origin.protocol) ||
          origin.host !== incoming.headers.host
        ) {
          return reject(403);
        }
      } catch {
        return reject(403);
      }
    }
    connections.add(client);
    client.once("close", () => connections.delete(client));
    client.pause();
    void (async () => {
      const headers = previewRequestHeaders(incoming.headers);
      if (!headers) return reject(401);
      const key = decodeURIComponent(match[1]);
      const decision = await resolve(headers, key);
      if (client.destroyed) return;
      if ("status" in decision) return reject(decision.status);
      const target = new URL(decision.upstream);
      const forwardHeaders = { ...incoming.headers, host: target.host };
      delete forwardHeaders.authorization;
      delete forwardHeaders.cookie;
      const upstream = request({
        hostname: target.hostname,
        port: target.port || 80,
        method: "GET",
        path: rewritePreviewForwardPath(incoming.url!, key, decision.previewBase),
        headers: forwardHeaders
      });
      client.once("close", () => upstream.destroy());
      upstream.setTimeout(10_000, () => upstream.destroy());
      upstream.once("error", () => reject(503));
      upstream.once("response", (response) => {
        response.resume();
        reject(response.statusCode && response.statusCode >= 400 ? response.statusCode : 502);
      });
      upstream.once("upgrade", (response, remote, remoteHead) => {
        if (client.destroyed) return remote.destroy();
        // The handshake timeout must not become an idle timeout on the live HMR socket.
        remote.setTimeout(0);
        connections.add(remote);
        remote.once("close", () => {
          connections.delete(remote);
          client.destroy();
        });
        remote.on("error", () => client.destroy());
        client.once("close", () => remote.destroy());
        const responseHeaders = response.rawHeaders.reduce<string[]>((lines, value, index, all) => {
          if (index % 2 === 0) lines.push(`${value}: ${all[index + 1]}`);
          return lines;
        }, []);
        client.write(`HTTP/1.1 101 Switching Protocols\r\n${responseHeaders.join("\r\n")}\r\n\r\n`);
        if (remoteHead.length) client.write(remoteHead);
        if (head.length) remote.write(head);
        remote.pipe(client);
        client.pipe(remote);
        client.resume();
      });
      upstream.end();
    })().catch(() => reject(503));
  };
  server.on("upgrade", upgrade);
  return {
    stop() {
      server.off("upgrade", upgrade);
      for (const socket of connections) socket.destroy();
      connections.clear();
    }
  };
}
