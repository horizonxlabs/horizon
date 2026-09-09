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
  assert.ok(isLockedFile(template, "next.config.js"));
  assert.ok(isLockedFile(template, "prisma/schema.prisma") === false, "schema models are editable");
  assert.ok(isLockedFile(template, "lib/storage.ts"));
  assert.ok(!isLockedFile(template, "app/page.tsx"));
});

test("locked Next config derives the build-time base path from the injected deployment environment", () => {
  const template = loadGoldenTemplate();
  const nextConfig = template.files.find((file) => file.path === "next.config.js");
  assert.ok(nextConfig, "next.config.js must exist in the golden template");
  assert.match(nextConfig.content, /process\.env\.EVCP_PREVIEW_BASE/);
  assert.match(nextConfig.content, /basePath: previewBase/);
  assert.match(nextConfig.content, /assetPrefix: previewBase/);
  assert.match(nextConfig.content, /NEXT_PUBLIC_BASE_PATH: previewBase \|\| ""/);
});

test("template files reference env vars, never literal secrets", () => {
  const template = loadGoldenTemplate();
  const all = template.files.map((file) => file.content).join("\n");
  assert.ok(all.includes("process.env.DATABASE_URL") || all.includes('env("DATABASE_URL")'));
  assert.ok(!/sk-[a-zA-Z0-9]{10,}/.test(all), "no literal keys in template");
});

test("starter homepage explains that Horizon AI is actively building the app", () => {
  const template = loadGoldenTemplate();
  const page = template.files.find((file) => file.path === "app/page.tsx");
  assert.ok(page, "starter homepage exists");
  assert.match(page.content, /Horizon AI is coding/i);
  assert.match(page.content, /Your app will appear here soon/);
  assert.match(page.content, /horizon-ai-coding-banner\.webp/);
  assert.doesNotMatch(page.content, /Build a leave request app/);
  assert.match(page.content, /items-center justify-center/, "layout stays centered");
  assert.doesNotMatch(page.content, /style jsx/, "server-rendered starter page avoids styled-jsx");
  assert.doesNotMatch(page.content, /page\.module\.css/, "starter styles with Tailwind, not CSS modules");
  const moduleCss = template.files.find((file) => file.path === "app/page.module.css");
  assert.equal(moduleCss, undefined, "the CSS module was replaced by Tailwind utilities");
});
