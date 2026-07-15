export function createProjectTurnLock() {
  const tails = new Map<string, Promise<void>>();

  return {
    async acquire(projectId: string): Promise<() => void> {
      const previous = tails.get(projectId) ?? Promise.resolve();
      let releaseGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      const tail = previous.then(() => gate);
      tails.set(projectId, tail);
      await previous;
      return () => {
        releaseGate();
        if (tails.get(projectId) === tail) {
          void tail.then(() => {
            if (tails.get(projectId) === tail) tails.delete(projectId);
          });
        }
      };
    }
  };
}
