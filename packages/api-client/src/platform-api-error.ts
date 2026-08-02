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
