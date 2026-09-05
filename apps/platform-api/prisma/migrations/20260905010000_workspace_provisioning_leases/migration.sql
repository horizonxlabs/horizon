CREATE TABLE "workspace_provisioning_leases" (
    "project_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspace_provisioning_leases_pkey" PRIMARY KEY ("project_id"),
    CONSTRAINT "workspace_provisioning_leases_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
