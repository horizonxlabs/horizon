/** Tracks scheduled and active capacity work so callers can stop requests, then safely drain. */
export function createWarmPoolWorkTracker() {
  const pending = new Set<Promise<unknown>>();
  return {
    track<T>(operation: Promise<T>): Promise<T> {
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation)
      );
      return operation;
    },
    async waitForIdle(): Promise<void> {
      while (pending.size > 0) await Promise.allSettled(pending);
    }
  };
}
