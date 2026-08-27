ALTER TABLE "app_store_registry_entries" ADD COLUMN "subdomain" TEXT;

CREATE UNIQUE INDEX "app_store_registry_entries_subdomain_key"
  ON "app_store_registry_entries"("subdomain");
