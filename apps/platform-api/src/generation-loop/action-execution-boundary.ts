import type { ActionResult } from "./action-runner-types";

export function boundedExecutionError(message: string): Extract<ActionResult, { ok: false }> {
  return { ok: false, error: message, stdout: "", stderr: "", exitCode: -1 };
}

export async function boundedExecution<T>(
  execution: Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number
): Promise<{ ok: true; value: T } | { ok: false; result: Extract<ActionResult, { ok: false }> }> {
  if (signal?.aborted) return { ok: false, result: boundedExecutionError("action aborted") };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const boundary = new Promise<never>((_, reject) => {
    if (timeoutMs) timeout = setTimeout(() => reject(new Error("action timed out")), timeoutMs);
    if (signal) {
      abortListener = () => reject(new Error("action aborted"));
      signal.addEventListener("abort", abortListener, { once: true });
    }
  });
  try {
    return { ok: true, value: await Promise.race([execution, boundary]) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "action failed";
    if (message === "action timed out" || message === "action aborted") {
      return { ok: false, result: boundedExecutionError(message) };
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }
}
