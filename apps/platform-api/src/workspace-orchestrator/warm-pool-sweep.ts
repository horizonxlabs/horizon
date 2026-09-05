import type { WorkspaceWarmPool } from "./warm-pool";

export function startWarmPoolSweep(
  pool: Pick<WorkspaceWarmPool, "reconcile" | "ensureCapacity">,
  opts: { intervalMs?: number; onError?: (error: unknown) => void } = {}
): { stop(): void } {
  let running = false;
  let stopped = false;
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = true;
    void Promise.resolve()
      .then(() => {
        if (!stopped) return pool.reconcile();
      })
      .then(() => {
        if (!stopped) return pool.ensureCapacity();
      })
      .catch((error) => {
        if (opts.onError) opts.onError(error);
        else console.warn("[workspace] warm pool sweep failed");
      })
      .finally(() => {
        running = false;
      });
  }, opts.intervalMs ?? 60_000);
  timer.unref?.();
  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    }
  };
}
