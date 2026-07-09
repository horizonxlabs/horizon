export interface HealthChecker {
  check(url: string): Promise<boolean>;
}

export function createMemoryHealthChecker(result: boolean): HealthChecker {
  return {
    async check() {
      return result;
    }
  };
}

export function createHttpHealthChecker(
  opts: {
    fetchImpl?: typeof fetch;
    retries?: number;
    delayMs?: number;
  } = {}
): HealthChecker {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 5;
  const delayMs = opts.delayMs ?? 1000;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    async check(url) {
      for (let attempt = 0; attempt < retries; attempt += 1) {
        try {
          const response = await fetchImpl(url, { method: "GET" });
          // Any non-server-error response means the container is up and routing (a deployed app may
          // legitimately 404/401 at "/" — e.g. auth-gated or no root route). Only 5xx / connection
          // errors count as not-yet-healthy.
          if (response.status < 500) {
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
