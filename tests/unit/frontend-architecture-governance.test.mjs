import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { checkFrontendArchitecture } = await import("../../scripts/quality/check-frontend-architecture.mjs");

test("frontend ADR defines the dependency direction", () => {
  const adr = readFileSync("docs/architecture/ADR-012-frontend-feature-first-governance.md", "utf8");
  assert.match(adr, /app → routes → features → shared/);
  assert.match(adr, /Shared modules must never import feature, route, or app modules/);
  assert.match(adr, /index\.ts is the only cross-feature public API/);
  assert.match(adr, /Component state.*URL state.*Server state.*Global client state/s);
});

test("legacy baseline is sorted and is app source only", () => {
  const files = JSON.parse(readFileSync("scripts/quality/frontend-legacy-path-baseline.json", "utf8"));
  assert.deepEqual(files, [...files].sort());
  assert.equal(files.every((file) => /^apps\/[^/]+\/src\//.test(file)), true);
});

test("architecture checker rejects forbidden source boundaries", () => {
  const root = mkdtempSync(join(tmpdir(), "evcp-architecture-"));
  const files = [
    ["apps/demo/src/shared/table.ts", "import { User } from '@/features/users';", "shared modules"],
    ["apps/demo/src/features/a/api/client.ts", "import { UserTable } from '@/features/users/components/UserTable';", "public @/features/users index.ts API"],
    ["apps/demo/src/components/NewCard.tsx", "export const NewCard = () => null;", "legacy root components"],
    ["apps/demo/src/assets/new-icon.ts", "export const icon = 'new';", "legacy root assets"],
    ["apps/demo/src/features/users/pages/UsersPage.tsx", "import { Button } from '../../../shared/Button';", "must use @/ aliases"]
  ];
  try {
    for (const [file, content, expected] of files) {
      const diskPath = join(process.cwd(), file);
      mkdirSync(join(diskPath, ".."), { recursive: true });
      writeFileSync(diskPath, content);
      assert.match(checkFrontendArchitecture([file]).join("\n"), new RegExp(expected));
      rmSync(diskPath);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("architecture checker permits public feature and shared alias imports", () => {
  const root = mkdtempSync(join(tmpdir(), "evcp-architecture-"));
  const files = [
    ["apps/demo/src/routes/users.ts", "import { Users } from '@/features/users';"],
    ["apps/demo/src/features/users/pages/UsersPage.tsx", "import { formatDate } from '@/shared/format-date';"]
  ];
  try {
    for (const [file, content] of files) {
      const diskPath = join(process.cwd(), file);
      mkdirSync(join(diskPath, ".."), { recursive: true });
      writeFileSync(diskPath, content);
      assert.deepEqual(checkFrontendArchitecture([file]), []);
      rmSync(diskPath);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("architecture checker permits relative imports within the same feature", () => {
  const file = "apps/demo/src/features/users/components/UserTable.tsx";
  const diskPath = join(process.cwd(), file);
  mkdirSync(join(diskPath, ".."), { recursive: true });
  writeFileSync(diskPath, "import { formatUser } from '../format-user';");
  try {
    assert.deepEqual(checkFrontendArchitecture([file]), []);
  } finally {
    rmSync(diskPath);
  }
});

test("architecture checker ignores the non-React Platform API source tree", () => {
  assert.deepEqual(
    checkFrontendArchitecture(["apps/platform-api/src/keycloak/oidc-service.ts"]),
    []
  );
});

test("quality commands and Vite configs expose the architecture gate and aliases", () => {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(rootPackage.scripts["check:frontend-architecture"], "node scripts/quality/check-frontend-architecture.mjs");
  for (const file of ["apps/admin-web/vite.config.ts", "apps/creator-web/vite.config.ts", "apps/app-store-pwa/vite.config.ts"]) {
    assert.match(readFileSync(file, "utf8"), /resolve\(__dirname, "src"\)/);
  }
  assert.match(readFileSync("scripts/quality/check.mjs", "utf8"), /check:frontend-architecture/);
  assert.match(readFileSync("scripts/quality/check-changed.mjs", "utf8"), /check-frontend-architecture\.mjs/);
});

test("developer docs describe the required feature-first workflow", () => {
  const architecture = readFileSync("docs/ARCHITECTURE.md", "utf8");
  const quality = readFileSync("docs/testing/code-quality.md", "utf8");
  assert.match(architecture, /features\/<feature-name>/);
  assert.match(architecture, /Feature public API/);
  assert.match(architecture, /Component state.*URL state.*Server state.*Global client state/s);
  assert.match(quality, /pnpm check:frontend-architecture/);
  assert.match(quality, /legacy baseline/);
});
