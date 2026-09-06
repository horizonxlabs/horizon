import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("startup seed never overwrites administrator AI providers, credentials, or routes", async () => {
  const source = await readFile(
    new URL("../../apps/platform-api/prisma/seed.ts", import.meta.url),
    "utf8"
  );
  const governance = source.slice(
    source.indexOf('where: { id: "aip_openai_production" }'),
    source.indexOf("await prisma.aiQuota.upsert")
  );

  assert.match(governance, /where: \{ id: "aip_openai_production" \},\s*update: \{\}/);
  assert.match(governance, /where: \{ id: "aik_openai_primary" \},\s*update: \{\}/);
  assert.match(governance, /where: \{ scenario \},\s*update: \{\}/);
  assert.doesNotMatch(governance, /update:\s*\{[^}]*secretCiphertext/s);
});

test("production startup runs image routing migration before demo-only seed exits", async () => {
  const source = await readFile(
    new URL("../../apps/platform-api/prisma/seed.ts", import.meta.url),
    "utf8"
  );

  const migrationIndex = source.indexOf("await seedImageGeneration(prisma);");
  const demoExitIndex = source.indexOf('if (process.env.EVCP_SEED_DEMO_PROJECT !== "1") return;');

  assert.ok(migrationIndex >= 0, "image routing migration must be invoked");
  assert.ok(demoExitIndex >= 0, "demo-only seed guard must exist");
  assert.ok(
    migrationIndex < demoExitIndex,
    "image routing migration must run in production before demo data is skipped"
  );
});
