-- DropIndex
DROP INDEX "projects_slug_key";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "slug";
