#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";

const FORMAT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);

const LINT_EXTENSIONS = new Set([".cjs", ".js", ".mjs", ".ts", ".tsx"]);
const DESIGN_SYSTEM_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".jsx",
  ".less",
  ".sass",
  ".scss",
  ".ts",
  ".tsx"
]);

const FORMAT_EXCLUDES = new Set(["pnpm-lock.yaml"]);

const LARGE_FILE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);
const LARGE_FILE_LINE_LIMIT = 400;

// Pre-existing files over the line limit at the time this gate was introduced.
// Grandfathered so this check only blocks *new* large files; splitting these up
// is tracked separately and not required to pass this gate.
const LARGE_FILE_ALLOWLIST = new Set([
  "apps/platform-api/src/platform-services.ts",
  "apps/admin-web/src/main.tsx",
  "apps/platform-api/src/app-factory.ts",
  "apps/platform-api/prisma/seed.ts",
  "apps/platform-api/src/persistence/publish-store-repositories.ts",
  "packages/api-client/src/index.ts",
  "apps/app-store-pwa/src/main.tsx",
  "apps/platform-api/src/persistence/core-repositories.ts",
  "apps/platform-api/src/persistence/generated-runtime-repositories.ts",
  "apps/platform-api/src/persistence/ai-governance-repositories.ts",
  "apps/platform-api/src/persistence/workspace-repositories.ts",
  "packages/ui/src/index.tsx"
]);

function parseArgs(argv) {
  const args = {
    base: null,
    format: false,
    formatOnly: false,
    staged: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base") {
      args.base = argv[++index];
    } else if (arg === "--format") {
      args.format = true;
    } else if (arg === "--format-only") {
      args.formatOnly = true;
      args.format = true;
    } else if (arg === "--staged") {
      args.staged = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/quality/check-changed.mjs [--staged | --base <ref>] [--format] [--format-only]",
      "",
      "Checks only changed files. Used by pre-commit and PR CI."
    ].join("\n")
  );
}

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    const stderr = result.stderr.toString("utf8").trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function getChangedFiles({ base, staged }) {
  const args = staged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
    : base
      ? ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`]
      : ["diff", "--name-only", "--diff-filter=ACMR", "-z", "HEAD"];

  return runGit(args)
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((file) => existsSync(file));
}

function runCommand(label, command, args) {
  if (args.length === 0) {
    return;
  }
  console.error(`[quality:changed] ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    shell: false,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function isFormatTarget(file) {
  return FORMAT_EXTENSIONS.has(extname(file)) && !FORMAT_EXCLUDES.has(file);
}

function isLintTarget(file) {
  return LINT_EXTENSIONS.has(extname(file));
}

function isLargeFileTarget(file) {
  return LARGE_FILE_EXTENSIONS.has(extname(file));
}

function isDesignSystemTarget(file) {
  return (
    file.startsWith("apps/") &&
    file.includes("/src/") &&
    DESIGN_SYSTEM_EXTENSIONS.has(extname(file))
  );
}

function countLines(file) {
  const content = readFileSync(file, "utf8");
  if (content.length === 0) return 0;
  const lines = content.split("\n");
  // A trailing newline produces one empty trailing element; don't count it as a line.
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length;
}

function checkLargeFiles(files) {
  const violations = [];
  const notes = [];

  for (const file of files) {
    const lineCount = countLines(file);
    if (lineCount <= LARGE_FILE_LINE_LIMIT) continue;

    if (LARGE_FILE_ALLOWLIST.has(file)) {
      notes.push(
        `[quality:changed] note: ${file} is ${lineCount} lines (limit ${LARGE_FILE_LINE_LIMIT}) — grandfathered, not blocking`
      );
    } else {
      violations.push(
        `${file} is ${lineCount} lines (limit ${LARGE_FILE_LINE_LIMIT}) — split it into focused modules`
      );
    }
  }

  for (const note of notes) {
    console.error(note);
  }

  if (violations.length > 0) {
    console.error("[quality:changed] large-file check failed");
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    process.exit(1);
  }
}

const args = parseArgs(process.argv.slice(2));
const changedFiles = getChangedFiles(args);

if (changedFiles.length === 0) {
  console.error("[quality:changed] no changed files to check");
  process.exit(0);
}

const formatFiles = changedFiles.filter(isFormatTarget);
const lintFiles = changedFiles.filter(isLintTarget);
const largeFileTargets = changedFiles.filter(isLargeFileTarget);
const designSystemTargets = changedFiles.filter(isDesignSystemTarget);

runCommand("conflict marker scan", "node", [
  "scripts/quality/check-no-conflict-markers.mjs",
  ...changedFiles
]);

if (!args.formatOnly && largeFileTargets.length > 0) {
  checkLargeFiles(largeFileTargets);
}

if (!args.formatOnly && designSystemTargets.length > 0) {
  runCommand("design system governance", "node", [
    "scripts/quality/check-design-system.mjs",
    ...designSystemTargets
  ]);
}

if (args.format && formatFiles.length > 0) {
  runCommand("format check", "pnpm", ["exec", "prettier", "--check", ...formatFiles]);
}

if (!args.formatOnly && lintFiles.length > 0) {
  runCommand("oxlint", "pnpm", ["exec", "oxlint", "--deny-warnings", ...lintFiles]);
}

if (
  !args.formatOnly &&
  changedFiles.some((file) => file.endsWith("package.json") || file === "pnpm-workspace.yaml")
) {
  runCommand("workspace package script check", "pnpm", ["check:workspace-scripts"]);
}

console.error("[quality:changed] changed-file checks passed");
