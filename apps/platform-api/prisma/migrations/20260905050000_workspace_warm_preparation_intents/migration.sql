-- Keep exact generation cleanup identity before dispatching external creates. No FK:
-- slot retries and successful claims may remove the parent while a response is in flight.
CREATE TABLE "workspace_warm_preparations" (
    "resource_key" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "operation_owner" TEXT NOT NULL,
    "settled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_warm_preparations_pkey" PRIMARY KEY ("resource_key")
);
