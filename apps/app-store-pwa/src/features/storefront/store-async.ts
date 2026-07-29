type StorefrontAsyncControllerOptions<T> = {
  loadHome(): Promise<T>;
  logout(): Promise<void>;
  onRefreshStart(options: StoreRefreshOptions): void;
  onRefreshSuccess(value: T): void;
  onRefreshFailure(error: Error, options: StoreRefreshOptions): void;
  onLogoutStart(): void;
  onLogoutFailure(error: Error): void;
  onLogoutSuccess(): void;
};

export type StoreRefreshOptions = {
  preserveReadyOnFailure?: boolean;
};

export type StoreRefreshResult =
  | { ok: true }
  | { ok: false; error: Error };

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

export function createStorefrontAsyncController<T>(controller: StorefrontAsyncControllerOptions<T>) {
  let mounted = true;
  let sequence = 0;

  async function refresh(refreshOptions: StoreRefreshOptions = {}): Promise<StoreRefreshResult> {
    if (!mounted) return { ok: true };
    const request = ++sequence;
    controller.onRefreshStart(refreshOptions);
    try {
      const next = await controller.loadHome();
      if (mounted && request === sequence) controller.onRefreshSuccess(next);
      return { ok: true };
    } catch (error) {
      if (mounted && request === sequence) {
        const failure = asError(error, "Unable to load your Store account.");
        controller.onRefreshFailure(failure, refreshOptions);
        return { ok: false, error: failure };
      }
      return { ok: true };
    }
  }

  async function logout(): Promise<void> {
    if (!mounted) return;
    const request = ++sequence;
    controller.onLogoutStart();
    try {
      await controller.logout();
    } catch (error) {
      if (mounted && request === sequence) {
        controller.onLogoutFailure(asError(error, "Unable to sign out securely."));
      }
      return;
    }
    if (mounted && request === sequence) controller.onLogoutSuccess();
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
