CREATE TABLE "project_lifecycle_states" (
  "project_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "deletion_owner_id" TEXT,
  "deletion_lease_expires_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_lifecycle_states_pkey" PRIMARY KEY ("project_id")
);

CREATE INDEX "project_lifecycle_states_status_deletion_lease_expires_at_idx"
  ON "project_lifecycle_states"("status", "deletion_lease_expires_at");

CREATE TABLE "project_mutation_leases" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_mutation_leases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_mutation_leases_project_id_expires_at_idx"
  ON "project_mutation_leases"("project_id", "expires_at");
