#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

function parseArgs(argv) {
  return {
    ci: argv.includes("--ci"),
    help: argv.includes("--help") || argv.includes("-h")
  };
}

function usage() {
  return [
    "Usage: node scripts/quality/check.mjs [--ci]",
    "",
    "Runs the repository quality gate. Local mode keeps the loop short;",
    "--ci adds install, build, and the full test suite."
  ].join("\n");
}

function runStep(step) {
  const started = performance.now();
  console.error(`\n[quality] ${step.name}`);
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    shell: false,
    stdio: "inherit"
  });
  const elapsedSeconds = ((performance.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`[quality] ${step.name} failed after ${elapsedSeconds}s`);
    process.exit(result.status ?? 1);
  }
  console.error(`[quality] ${step.name} passed in ${elapsedSeconds}s`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(usage());
  process.exit(0);
}

const steps = [
  { name: "repository hygiene", command: "pnpm", args: ["lint:repo"] },
  { name: "conflict markers", command: "pnpm", args: ["check:no-conflict-markers"] },
  { name: "workspace package scripts", command: "pnpm", args: ["check:workspace-scripts"] },
  { name: "design system governance", command: "pnpm", args: ["check:design-system"] },
  { name: "frontend architecture", command: "pnpm", args: ["check:frontend-architecture"] },
  { name: "code lint", command: "pnpm", args: ["lint:code"] },
  { name: "typecheck", command: "pnpm", args: ["typecheck"] },
  { name: "unit tests", command: "pnpm", args: ["test:unit"] }
];

if (args.ci) {
  steps.splice(1, 0, {
    name: "install contract",
    command: "pnpm",
    args: ["install:preflight:example"]
  });
  steps.push(
    { name: "build", command: "pnpm", args: ["build"] },
    { name: "integration tests", command: "pnpm", args: ["test:integration"] },
    { name: "e2e tests", command: "pnpm", args: ["test:e2e"] }
  );
}

for (const step of steps) {
  runStep(step);
}

console.error("\n[quality] all checks passed");
