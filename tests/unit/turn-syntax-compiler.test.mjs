import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  buildSyntaxCheckCommand,
  collectWriteIssues
} from "../../apps/platform-api/src/generation-loop/turn-checks.ts";

async function checkSource(t, content) {
  const workspace = await mkdtemp(join(tmpdir(), "evcp-syntax-check-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(join(workspace, "app"));
  await symlink(resolve("node_modules"), join(workspace, "node_modules"), "dir");
  await writeFile(join(workspace, "app/page.tsx"), content);
  const command = buildSyntaxCheckCommand("app/page.tsx").replace("cd /workspace && ", "");
  return collectWriteIssues(
    {
      checkFileSyntax: async () =>
        execFileSync("sh", ["-c", command], { cwd: workspace, encoding: "utf8", timeout: 30_000 })
    },
    "test-container",
    { path: "app/page.tsx", content },
    new Set(["app/page.tsx"])
  );
}

test("syntax compiler accepts the generated-image process.env reference", async (t) => {
  const issues = await checkSource(
    t,
    'export default function Page() { return <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/generated/hero.png`} />; }'
  );
  assert.deepEqual(issues, []);
});

test("syntax compiler accepts a guarded process reference without ambient Node resolution", async (t) => {
  const issues = await checkSource(
    t,
    'export default function Page() { return <img src={`${typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_BASE_PATH ?? "" : ""}/generated/hero.png`} />; }'
  );
  assert.deepEqual(issues, []);
});

test("syntax compiler still rejects mismatched JSX tags", async (t) => {
  const issues = await checkSource(
    t,
    "export default function Page() { return <div>broken</span>; }"
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /TS17002.*corresponding JSX closing tag/);
});

test("syntax compiler leaves semantic type errors to full project validation", async (t) => {
  const issues = await checkSource(t, 'export const amount: number = "invalid";');
  assert.deepEqual(issues, []);
});
