#!/usr/bin/env node
import { existsSync } from "node:fs";
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

const FORMAT_EXCLUDES = new Set(["pnpm-lock.yaml"]);

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

const args = parseArgs(process.argv.slice(2));
const changedFiles = getChangedFiles(args);

if (changedFiles.length === 0) {
  console.error("[quality:changed] no changed files to check");
  process.exit(0);
}

const formatFiles = changedFiles.filter(isFormatTarget);
const lintFiles = changedFiles.filter(isLintTarget);

runCommand("conflict marker scan", "node", [
  "scripts/quality/check-no-conflict-markers.mjs",
  ...changedFiles
]);

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
