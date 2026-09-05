export type WarmWorkspaceSlotState = "preparing" | "ready" | "claiming" | "failed";

export interface WarmWorkspaceSlot {
  id: string;
  resourceKey: string;
  state: WarmWorkspaceSlotState;
  containerId: string | null;
  llmGatewayKeyId: string | null;
  secretPayload: string | null;
  claimProjectId: string | null;
  lastError: string | null;
  retryAfter: string | null;
  failureCount: number;
  readyAt: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarmWorkspaceAllocation {
  slotId: string;
  resourceKey: string;
  containerId: string;
  llmGatewayKeyId: string;
  env: Record<string, string>;
}

export interface WorkspaceWarmSlotStore {
  list(): Promise<WarmWorkspaceSlot[]>;
  createPreparing(slot: Pick<WarmWorkspaceSlot, "id" | "resourceKey">): Promise<WarmWorkspaceSlot>;
  markReady(
    id: string,
    patch: { containerId: string; llmGatewayKeyId: string; secretPayload: string }
  ): Promise<void>;
  markFailed(
    id: string,
    patch: { lastError: string; retryAfter: string; failureCount: number }
  ): Promise<void>;
  claim(projectId: string): Promise<WarmWorkspaceSlot | null>;
  remove(id: string): Promise<void>;
}
