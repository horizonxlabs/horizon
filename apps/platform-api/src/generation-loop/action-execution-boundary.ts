import type { ActionResult } from "./action-runner-types";

export function boundedExecutionError(message: string): Extract<ActionResult, { ok: false }> {
  return { ok: false, error: message, stdout: "", stderr: "", exitCode: -1 };
}

export async function boundedExecution<T>(
  execution: Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number
): Promise<{ ok: true; value: T } | { ok: false; result: Extract<ActionResult, { ok: false }> }> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  type Boundary = { kind: "boundary"; message: "action timed out" | "action aborted" };
  type Settled = { kind: "value"; value: T } | { kind: "error"; error: unknown };
  const settled: Promise<Settled> = execution.then(
    (value) => ({ kind: "value", value }),
    (error: unknown) => ({ kind: "error", error })
  );
  const boundary = new Promise<Boundary>((resolve) => {
    if (timeoutMs) {
      timeout = setTimeout(
        () => resolve({ kind: "boundary", message: "action timed out" }),
        timeoutMs
      );
    }
    if (signal) {
      abortListener = () => resolve({ kind: "boundary", message: "action aborted" });
      signal.addEventListener("abort", abortListener, { once: true });
      if (signal.aborted) abortListener();
    }
  });
  try {
    const first = await Promise.race([settled, boundary]);
    if (first.kind === "boundary") {
      await settled;
      return { ok: false, result: boundedExecutionError(first.message) };
    }
    if (first.kind === "error") throw first.error;
    return { ok: true, value: first.value };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (signal && abortListener) signal.removeEventListener("abort", abortListener);
  }
}
