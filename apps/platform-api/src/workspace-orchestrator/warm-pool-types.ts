export type WarmWorkspaceSlotState = "preparing" | "ready" | "claiming" | "cleaning" | "failed";

export interface WarmWorkspaceSlot {
  id: string;
  resourceKey: string;
  state: WarmWorkspaceSlotState;
  containerId: string | null;
  llmGatewayKeyId: string | null;
  secretPayload: string | null;
  claimProjectId: string | null;
  operationOwner: string | null;
  operationExpiresAt: string | null;
  lastError: string | null;
  retryAfter: string | null;
  failureCount: number;
  readyAt: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarmSlotOperationLease {
  ownerId: string;
  now: string;
  expiresAt: string;
}

export interface WarmWorkspaceAllocation {
  slotId: string;
  resourceKey: string;
  containerId: string;
  llmGatewayKeyId: string;
  env: Record<string, string>;
}

/** Non-secret intent retained independently of the slot's retry/claim lifecycle. */
export interface WarmPreparationIntent {
  resourceKey: string;
  slotId: string;
  operationOwner: string;
  settled: boolean;
}

export interface WarmPreparationIntentStore {
  list(): Promise<WarmPreparationIntent[]>;
  create(intent: Omit<WarmPreparationIntent, "settled">): Promise<void>;
  settle(resourceKey: string): Promise<void>;
  remove(resourceKey: string): Promise<void>;
}

export interface WorkspaceWarmSlotStore {
  preparations: WarmPreparationIntentStore;
  list(): Promise<WarmWorkspaceSlot[]>;
  createPreparing(
    slot: Pick<WarmWorkspaceSlot, "id" | "resourceKey">,
    lease?: WarmSlotOperationLease
  ): Promise<WarmWorkspaceSlot>;
  reservePreparing(
    targetSize: number,
    candidates: Array<Pick<WarmWorkspaceSlot, "id" | "resourceKey">>,
    lease: WarmSlotOperationLease
  ): Promise<WarmWorkspaceSlot[]>;
  recordPreparedResources(
    id: string,
    patch: { llmGatewayKeyId: string; secretPayload: string },
    lease?: WarmSlotOperationLease
  ): Promise<boolean>;
  recordPreparingContainer(
    id: string,
    containerId: string,
    lease?: WarmSlotOperationLease
  ): Promise<boolean>;
  markReady(
    id: string,
    patch: { containerId: string; llmGatewayKeyId: string; secretPayload: string },
    lease?: WarmSlotOperationLease
  ): Promise<boolean>;
  markFailed(
    id: string,
    patch: { lastError: string; retryAfter: string; failureCount: number },
    lease?: WarmSlotOperationLease
  ): Promise<boolean>;
  renewOperation(id: string, lease: WarmSlotOperationLease): Promise<boolean>;
  acquireCleanup(
    id: string,
    expectedState: WarmWorkspaceSlotState,
    lease: WarmSlotOperationLease
  ): Promise<WarmWorkspaceSlot | null>;
  retryPreparing(
    id: string,
    resourceKey: string,
    lease: WarmSlotOperationLease
  ): Promise<WarmWorkspaceSlot | null>;
  claim(projectId: string): Promise<WarmWorkspaceSlot | null>;
  remove(id: string, ownerId?: string): Promise<boolean>;
}
