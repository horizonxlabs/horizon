import test from "node:test";
import assert from "node:assert/strict";

const { findMissingImports, buildSyntaxCheckCommand, collectWriteIssues, collectRoundIssues } = await import(
  "../../apps/platform-api/src/generation-loop/turn-checks.ts"
);

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
