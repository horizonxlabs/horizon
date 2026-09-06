import { Module, type OnApplicationShutdown } from "@nestjs/common";

@Module({})
export class PlatformApiModule implements OnApplicationShutdown {
  private sweepHandles: Array<{ stop(): void }> = [];

  registerWorkspaceSweeps(handles: Array<{ stop(): void }>): void {
    this.sweepHandles.push(...handles);
  }

  onApplicationShutdown(): void {
    for (const handle of this.sweepHandles) handle.stop();
    this.sweepHandles = [];
  }
}
