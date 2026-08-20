import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const {
  findMissingImports,
  buildSyntaxCheckCommand,
  collectWriteIssues,
  collectRoundIssues,
  isWorkspaceNodeModulesAccessError,
  WORKSPACE_NODE_MODULES_REPAIR_COMMAND
} = await import("../../apps/platform-api/src/generation-loop/turn-checks.ts");

const KNOWN = new Set([
  "app/page.tsx",
  "components/ui/button.tsx",
  "lib/mock-data.ts",
  "components/Dashboard.tsx"
]);

test("missing local imports are caught before the build ever runs", () => {
  const content = [
    'import { Button } from "@/components/ui/button";',
    'import { FleetTable } from "@/components/FleetTable";',
    'import { rows } from "./data";',
    'import { useState } from "react";'
  ].join("\n");
  const missing = findMissingImports("app/page.tsx", content, KNOWN);
  assert.deepEqual(missing, ["components/FleetTable", "app/data"]);
});

test("existing imports and package imports pass silently", () => {
  const content = [
    'import { Button } from "@/components/ui/button";',
    'import Dashboard from "@/components/Dashboard";',
    'import { Pool } from "pg";'
  ].join("\n");
  assert.deepEqual(findMissingImports("app/page.tsx", content, KNOWN), []);
});

test("syntax check command is safe, single-file, and resolution-free", () => {
  const command = buildSyntaxCheckCommand("app/page.tsx");
  assert.match(command, /--noEmit/);
  assert.match(command, /--noResolve/);
  assert.match(command, /--jsx/);
  assert.match(command, /app\/page\.tsx/);
  assert.throws(() => buildSyntaxCheckCommand("app/$(rm -rf).tsx"), /path/i);
});

// Regression: SAFE_PATH here didn't allow [ ], so the in-turn syntax check silently no-opped
// (swallowed by collectWriteIssues' .catch) for any Next.js dynamic route, even though
// pi-tool-policy.ts's SAFE_PROJECT_SEGMENT already allows writing those files.
test("syntax check command accepts Next.js dynamic-route paths", () => {
  for (const path of [
    "app/api/tasks/[id]/route.ts",
    "app/blog/[...slug]/page.tsx",
    "app/shop/[[...slug]]/page.tsx"
  ]) {
    assert.doesNotThrow(() => buildSyntaxCheckCommand(path));
    assert.match(buildSyntaxCheckCommand(path), new RegExp(path.replace(/[.[\]]/g, "\\$&")));
  }
});

// Regression: a host filesystem quirk (observed in production on Docker Desktop for Mac)
// occasionally makes /workspace/node_modules' symlink target return EACCES from stat(),
// even for root. tsc then crashes with a Node stack trace instead of reporting a real
// syntax error, and the model burns its feedback round fighting a phantom problem. This
// must be recognized so the caller can self-heal instead of surfacing it as a syntax error.
test("recognizes the workspace node_modules EACCES filesystem quirk", () => {
  const output = [
    "node:fs:2822",
    "        binding.stat(base, false, undefined, true);",
    "                ^",
    "",
    "Error: EACCES: permission denied, stat '/workspace/node_modules'",
    "    at Object.realpathSync (node:fs:2822:17)",
    "    at toRealPath (node:internal/modules/helpers:61:13)",
    "    at Function._findPath (node:internal/modules/cjs/loader:746:22)",
    "    at resolveMainPath (node:internal/modules/run_main:39:23)"
  ].join("\n");
  assert.equal(isWorkspaceNodeModulesAccessError(output), true);
});

test("a real tsc syntax error is not mistaken for the node_modules quirk", () => {
  const output = "app/page.tsx(1,23): error TS2307: Cannot find module '@/components/ui/badge'";
  assert.equal(isWorkspaceNodeModulesAccessError(output), false);
});

test("the node_modules repair command recreates the symlink in place", () => {
  assert.match(WORKSPACE_NODE_MODULES_REPAIR_COMMAND, /rm -f \/workspace\/node_modules/);
  assert.match(
    WORKSPACE_NODE_MODULES_REPAIR_COMMAND,
    /ln -s \/opt\/evcp-template\/node_modules \/workspace\/node_modules/
  );
});

test("collectWriteIssues merges syntax and import findings", async () => {
  const issues = await collectWriteIssues(
    {
      checkFileSyntax: async () => "app/page.tsx(53,1): error TS1005: '}' expected."
    },
    "c1",
    { path: "app/page.tsx", content: 'import { X } from "@/components/Nope";' },
    KNOWN
  );
  assert.equal(issues.length, 2);
  assert.match(issues[0], /'}' expected/);
  assert.match(issues[1], /components\/Nope/);
  const clean = await collectWriteIssues(
    { checkFileSyntax: async () => "" },
    "c1",
    { path: "app/page.tsx", content: 'import { Button } from "@/components/ui/button";' },
    KNOWN
  );
  assert.deepEqual(clean, []);
});

test("syntax-only checks ignore package-resolution diagnostics and leave them to the full build", async () => {
  const issues = await collectWriteIssues(
    {
      checkFileSyntax: async () =>
        "components/chart.tsx(4,55): error TS2307: Cannot find module 'lightweight-charts' or its corresponding type declarations."
    },
    "c1",
    {
      path: "components/chart.tsx",
      content: 'import { createChart } from "lightweight-charts";'
    },
    KNOWN
  );

  assert.deepEqual(issues, []);
});

test("round-final evaluation: imports satisfied by later files in the artifact never flag", async () => {
  // page.tsx (written first) imports CertForm (written after) — evaluated at round end
  // against the FINAL file set, this is clean. The per-action version of this check once
  // told the model its files "weren't saved" and triggered a full 767-line rebuild.
  const finalPaths = new Set([...KNOWN, "app/page.tsx", "components/CertForm.tsx"]);
  const issues = await collectRoundIssues(
    { checkFileSyntax: async () => "" },
    "c1",
    [
      { path: "app/page.tsx", content: 'import { CertForm } from "@/components/CertForm";' },
      { path: "components/CertForm.tsx", content: "export function CertForm() { return null; }" }
    ],
    finalPaths
  );
  assert.deepEqual(issues, []);
});

test("Pi generation performs round-final write checks before full validation", async () => {
  const serviceSource = await readFile(
    "apps/platform-api/src/generation-loop/pi-generation-service.ts",
    "utf8"
  );
  assert.match(serviceSource, /collectPiWriteIssues/);
  const checksSource = await readFile(
    "apps/platform-api/src/generation-loop/turn-checks.ts",
    "utf8"
  );
  assert.match(checksSource, /collectRoundIssues/);
});
