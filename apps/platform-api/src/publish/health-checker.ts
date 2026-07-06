export interface HealthChecker {
  check(url: string): Promise<boolean>;
}

export function createMemoryHealthChecker(result: boolean): HealthChecker {
  return { async check() { return result; } };
}

export function createHttpHealthChecker(opts: {
  fetchImpl?: typeof fetch;
  retries?: number;
  delayMs?: number;
} = {}): HealthChecker {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 5;
  const delayMs = opts.delayMs ?? 1000;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async check(url) {
      for (let attempt = 0; attempt < retries; attempt += 1) {
        try {
          const response = await fetchImpl(url, { method: "GET" });
          if (response.status >= 200 && response.status < 400) {
            return true;
          }
        } catch {
          // network error — treat as not-yet-healthy, retry
        }
        if (attempt < retries - 1 && delayMs > 0) {
          await wait(delayMs);
        }
      }
      return false;
    }
  };
}
