type StorefrontAsyncControllerOptions<T> = {
  loadHome(): Promise<T>;
  logout(): Promise<void>;
  onRefreshStart(): void;
  onRefreshSuccess(value: T): void;
  onRefreshFailure(error: Error): void;
  onLogoutStart(): void;
  onLogoutFailure(error: Error): void;
  onLogoutSuccess(): void;
};

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

export function createStorefrontAsyncController<T>(options: StorefrontAsyncControllerOptions<T>) {
  let mounted = true;
  let sequence = 0;

  async function refresh(): Promise<void> {
    if (!mounted) return;
    const request = ++sequence;
    options.onRefreshStart();
    try {
      const next = await options.loadHome();
      if (mounted && request === sequence) options.onRefreshSuccess(next);
    } catch (error) {
      if (mounted && request === sequence) {
        options.onRefreshFailure(asError(error, "Unable to load your Store account."));
      }
    }
  }

  async function logout(): Promise<void> {
    if (!mounted) return;
    const request = ++sequence;
    options.onLogoutStart();
    try {
      await options.logout();
    } catch (error) {
      if (mounted && request === sequence) {
        options.onLogoutFailure(asError(error, "Unable to sign out securely."));
      }
      return;
    }
    if (mounted && request === sequence) options.onLogoutSuccess();
  }

  return {
    refresh,
    logout,
    mount(): void { mounted = true; },
    unmount(): void {
      mounted = false;
      sequence += 1;
    }
  };
}
