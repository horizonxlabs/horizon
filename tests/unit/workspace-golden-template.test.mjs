import test from "node:test";
import assert from "node:assert/strict";

const { loadGoldenTemplate, isLockedFile } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/template.ts"
);

test("loads the nextjs-base template with manifest", () => {
  const template = loadGoldenTemplate();
  assert.equal(template.name, "nextjs-base");
  const paths = template.files.map((file) => file.path);
  for (const required of [
    "package.json",
    "platform.config.ts",
    "prisma/schema.prisma",
    "app/layout.tsx",
    "app/page.tsx",
    "lib/storage.ts"
  ]) {
    assert.ok(paths.includes(required), `missing template file ${required}`);
  }
});

test("locked files include platform config, prisma datasource and storage wiring", () => {
  const template = loadGoldenTemplate();
  assert.ok(isLockedFile(template, "platform.config.ts"));
  assert.ok(isLockedFile(template, "prisma/schema.prisma") === false, "schema models are editable");
  assert.ok(isLockedFile(template, "lib/storage.ts"));
  assert.ok(!isLockedFile(template, "app/page.tsx"));
});

test("template files reference env vars, never literal secrets", () => {
  const template = loadGoldenTemplate();
  const all = template.files.map((file) => file.content).join("\n");
  assert.ok(all.includes("process.env.DATABASE_URL") || all.includes('env("DATABASE_URL")'));
  assert.ok(!/sk-[a-zA-Z0-9]{10,}/.test(all), "no literal keys in template");
});
