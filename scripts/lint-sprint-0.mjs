import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

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
  "apps/platform-api/prisma/migrations/20260703000004_sprint5_database_restore/migration.sql",
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
  "docs/delivery/sprint-5-delivery-note.md",
  "docs/delivery/sprint-5-product-owner-acceptance.md",
  "docs/delivery/sprint-delivery-governance.md",
  "docs/design/design-system.md",
  "docs/assets/screenshots/sprint2-admin-governance.png",
  "docs/assets/screenshots/sprint3-creator-prd.png",
  "docs/assets/screenshots/sprint4-creator-workspace.png",
  "docs/assets/screenshots/sprint5-database-restore.png",
  "docker/docker-compose.yml",
  "docker/.gitkeep",
  "generated-apps/.gitkeep"
];

const secretValuePatterns = [
  { name: "OpenAI-style API key", pattern: /sk-[A-Za-z0-9]{20,}/ },
  { name: "hardcoded password string", pattern: /password\s*=\s*["'][^"'<>{}\s][^"']{7,}["']/i }
];

const secretAssignmentPattern = /^\s*(OPENAI_API_KEY|ANTHROPIC_API_KEY)\s*=\s*(.+?)\s*$/;
const allowedSecretPlaceholders = /^(|["']?(example|changeme|change-me|change-before-use|placeholder|your[-_ ]?key|.*<[^>]+>.*)["']?)$/i;

function trackedTextFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return output
    .split("\0")
    .filter(Boolean)
    .filter((path) => !/\.(png|jpg|jpeg|webp|ico|woff2?)$/i.test(path));
}

function scanSecretAssignments(file, text) {
  const failures = [];
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const match = secretAssignmentPattern.exec(lines[index]);
    if (!match) {
      continue;
    }
    const value = match[2].trim();
    if (!allowedSecretPlaceholders.test(value)) {
      failures.push(`Potential secret assignment in ${file}:${index + 1}: ${match[1]}`);
    }
  }
  return failures;
}

const failures = [];

for (const file of requiredFiles) {
  try {
    statSync(file);
  } catch {
    failures.push(`Missing required file: ${file}`);
  }
}

for (const file of trackedTextFiles()) {
  const text = readFileSync(file, "utf8");
  for (const { name, pattern } of secretValuePatterns) {
    if (pattern.test(text)) {
      failures.push(`Potential secret pattern in ${file}: ${name}`);
    }
  }
  failures.push(...scanSecretAssignments(file, text));
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Sprint lint checks passed");
