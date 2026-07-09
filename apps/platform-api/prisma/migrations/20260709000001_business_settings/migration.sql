-- CreateTable
CREATE TABLE "business_settings" (
  "id" TEXT NOT NULL,
  "business_name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  "locale" TEXT NOT NULL DEFAULT 'th',
  "contact_email" TEXT,
  "website" TEXT,
  "logo_url" TEXT,
  "industry" TEXT,
  "setup_completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);
