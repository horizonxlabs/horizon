import { Module, type BeforeApplicationShutdown } from "@nestjs/common";

@Module({})
export class PlatformApiModule implements BeforeApplicationShutdown {
  private sweepHandles: Array<{ stop(): void }> = [];

  registerWorkspaceSweeps(handles: Array<{ stop(): void }>): void {
    this.sweepHandles.push(...handles);
  }

  // Upgraded sockets must close before Nest waits for its HTTP server to drain.
  beforeApplicationShutdown(): void {
    for (const handle of this.sweepHandles) handle.stop();
    this.sweepHandles = [];
  }
}
