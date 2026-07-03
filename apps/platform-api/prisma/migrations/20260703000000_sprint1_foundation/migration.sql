CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'invited', 'suspended');
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "AppStatus" AS ENUM ('draft', 'published', 'disabled', 'archived');
CREATE TYPE "AuditSeverity" AS ENUM ('info', 'warning', 'high', 'critical');

CREATE TABLE "platform_users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_groups" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_roles" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "permissions" TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_user_groups" (
  "user_id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  CONSTRAINT "platform_user_groups_pkey" PRIMARY KEY ("user_id", "group_id")
);

CREATE TABLE "platform_user_roles" (
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  CONSTRAINT "platform_user_roles_pkey" PRIMARY KEY ("user_id", "role_id")
);

CREATE TABLE "projects" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
  "owner_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_members" (
  "project_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id", "user_id")
);

CREATE TABLE "apps" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "AppStatus" NOT NULL DEFAULT 'draft',
  "project_id" TEXT NOT NULL,
  "database_schema_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_roles" (
  "id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "permissions" TEXT[],
  CONSTRAINT "app_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_members" (
  "app_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  CONSTRAINT "app_members_pkey" PRIMARY KEY ("app_id", "user_id", "role_id")
);

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "severity" "AuditSeverity" NOT NULL DEFAULT 'info',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "request_id" TEXT,
  "previous_hash" TEXT,
  "record_hash" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");
CREATE UNIQUE INDEX "platform_groups_key_key" ON "platform_groups"("key");
CREATE UNIQUE INDEX "platform_roles_key_key" ON "platform_roles"("key");
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
CREATE UNIQUE INDEX "apps_slug_key" ON "apps"("slug");
CREATE UNIQUE INDEX "apps_database_schema_name_key" ON "apps"("database_schema_name");
CREATE UNIQUE INDEX "app_roles_app_id_key_key" ON "app_roles"("app_id", "key");
CREATE INDEX "audit_logs_actor_user_id_occurred_at_idx" ON "audit_logs"("actor_user_id", "occurred_at");
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

ALTER TABLE "platform_user_groups" ADD CONSTRAINT "platform_user_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_user_groups" ADD CONSTRAINT "platform_user_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "platform_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_user_roles" ADD CONSTRAINT "platform_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_user_roles" ADD CONSTRAINT "platform_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "platform_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "apps" ADD CONSTRAINT "apps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_roles" ADD CONSTRAINT "app_roles_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_members" ADD CONSTRAINT "app_members_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_members" ADD CONSTRAINT "app_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_members" ADD CONSTRAINT "app_members_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "app_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
