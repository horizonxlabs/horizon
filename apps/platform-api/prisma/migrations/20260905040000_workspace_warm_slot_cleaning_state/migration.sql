CREATE TYPE "WorkspaceWarmSlotState" AS ENUM (
  'preparing',
  'ready',
  'claiming',
  'cleaning',
  'failed'
);

ALTER TABLE "workspace_warm_slots"
  ALTER COLUMN "state" TYPE "WorkspaceWarmSlotState"
  USING ("state"::"WorkspaceWarmSlotState");
