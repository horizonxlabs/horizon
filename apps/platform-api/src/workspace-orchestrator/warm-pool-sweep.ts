import type { WorkspaceWarmPool } from "./warm-pool";

export function startWarmPoolSweep(
  pool: Pick<WorkspaceWarmPool, "ensureCapacity">,
  opts: { intervalMs?: number } = {}
): { stop(): void } {
  let running = false;
  let stopped = false;
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = true;
    void Promise.resolve()
      .then(() => {
        if (!stopped) return pool.ensureCapacity();
      })
      .catch(() => undefined)
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
