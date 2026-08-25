ALTER TABLE "project_lifecycle_states"
  ADD COLUMN "epoch" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mutation_epoch" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "project_mutation_leases"
  ADD COLUMN "epoch" INTEGER NOT NULL DEFAULT 0;
