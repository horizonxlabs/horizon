import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "CHANGELOG.md",
  "apps/admin-web/src/main.tsx",
  "apps/admin-web/public/favicon.svg",
  "apps/creator-web/src/main.tsx",
  "apps/app-store-pwa/src/main.tsx",
  "apps/platform-api/src/app-factory.ts",
  "apps/platform-api/src/main.ts",
  "apps/platform-api/src/platform-services.ts",
  "apps/platform-api/prisma/schema.prisma",
  "apps/platform-api/prisma/migrations/20260703000000_sprint1_foundation/migration.sql",
  "apps/platform-api/prisma/migrations/20260703000001_sprint2_ai_governance/migration.sql",
  "apps/platform-api/prisma/migrations/20260703000002_sprint3_prd_generation/migration.sql",
  "apps/platform-api/prisma/migrations/20260703000003_sprint4_workspace_preview/migration.sql",
  "apps/platform-api/prisma/seed.ts",
  "packages/ui/src/index.tsx",
  "packages/ui/styles.css",
  "packages/auth-sdk/src/index.ts",
  "packages/api-client/src/index.ts",
  "packages/mock-data/src/index.ts",
  "docs/delivery/sprint-0-product-owner-acceptance.md",
  "docs/delivery/sprint-1-delivery-note.md",
  "docs/delivery/sprint-1-product-owner-acceptance.md",
  "docs/delivery/sprint-2-delivery-note.md",
  "docs/delivery/sprint-2-product-owner-acceptance.md",
  "docs/delivery/sprint-3-delivery-note.md",
  "docs/delivery/sprint-3-product-owner-acceptance.md",
  "docs/delivery/sprint-4-delivery-note.md",
  "docs/delivery/sprint-4-product-owner-acceptance.md",
  "docs/delivery/sprint-delivery-governance.md",
  "docs/design/design-system.md",
  "docs/assets/screenshots/sprint2-admin-governance.png",
  "docs/assets/screenshots/sprint3-creator-prd.png",
  "docs/assets/screenshots/sprint4-creator-workspace.png",
  "docker/docker-compose.yml",
  "docker/.gitkeep",
  "generated-apps/.gitkeep"
];

const disallowedPatterns = [
  /sk-[A-Za-z0-9]{20,}/,
  /OPENAI_API_KEY\s*=/,
  /ANTHROPIC_API_KEY\s*=/,
  /password\s*=\s*["'][^"']+["']/i
];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    if ([".git", "node_modules", ".pnpm-store", "dist", "coverage", "playwright-report", "test-results"].includes(name)) {
      continue;
    }
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) entries.push(...walk(path));
    else if (!/\.(png|jpg|jpeg|webp|ico)$/i.test(path)) entries.push(path);
  }
  return entries;
}

const failures = [];

for (const file of requiredFiles) {
  try {
    statSync(file);
  } catch {
    failures.push(`Missing required file: ${file}`);
  }
}

for (const file of walk(".")) {
  const text = readFileSync(file, "utf8");
  for (const pattern of disallowedPatterns) {
    if (pattern.test(text)) {
      failures.push(`Potential secret pattern in ${file}: ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Sprint lint checks passed");
