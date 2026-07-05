CREATE TABLE "app_installations" (
  "id" TEXT NOT NULL,
  "app_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabled_at" TIMESTAMP(3),
  "last_opened_at" TIMESTAMP(3),
  CONSTRAINT "app_installations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_installations_app_id_user_id_key" ON "app_installations"("app_id", "user_id");
CREATE INDEX "app_installations_user_id_status_idx" ON "app_installations"("user_id", "status");

ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_installations" ADD CONSTRAINT "app_installations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
