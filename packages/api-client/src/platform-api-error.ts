// Extracted from index.ts to keep that file under its size ratchet; index.ts re-exports this so
// existing importers (`from "@evcp/api-client"`) keep working unchanged.
export class PlatformApiError extends Error {
  readonly code: string;
  readonly traceId?: string;
  readonly status?: number;

  constructor(input: { code: string; message: string; traceId?: string; status?: number }) {
    super(input.message);
    this.name = "PlatformApiError";
    this.code = input.code;
    this.traceId = input.traceId;
    this.status = input.status;
  }
}

// App Store publishing returns the standard envelope on success, but its runtime
// build/check routes return a bare error. Preserve both formats for the UI.
export function responseError(body: unknown, status: number, statusText: string) {
  const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const nested =
    payload.error && typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>)
      : {};
  const code =
    typeof nested.code === "string"
      ? nested.code
      : typeof payload.error === "string"
        ? payload.error
        : `HTTP_${status}`;
  const failures = Array.isArray(payload.failures)
    ? payload.failures.filter((value): value is string => typeof value === "string").join("; ")
    : "";
  const message =
    typeof nested.message === "string" && nested.message
      ? nested.message
      : typeof payload.message === "string" && payload.message
        ? payload.message
        : failures ||
          (typeof payload.error === "string" ? code.replaceAll("_", " ") : statusText) ||
          code;
  return new PlatformApiError({
    code,
    message,
    status,
    traceId: typeof nested.traceId === "string" ? nested.traceId : undefined
  });
}
