// Node's http server kills any request older than requestTimeout (default 300s). AI build
// turns stream far longer than that, so the browser saw "network error" mid-turn while the
// server kept generating and held the project's turn lock. Disable the per-request ceiling
// for this API (SSE streams stay open as long as the turn runs) while keeping the
// slow-header and keep-alive guards that protect against stalled clients.
export function allowLongAiStreams(server: {
  requestTimeout: number;
  headersTimeout?: number;
  keepAliveTimeout?: number;
}): void {
  server.requestTimeout = 0;
}
