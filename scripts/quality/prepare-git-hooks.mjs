#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync("git-hooks")) {
  process.exit(0);
}

const insideWorktree = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"]
});

if (insideWorktree.status !== 0 || insideWorktree.stdout.trim() !== "true") {
  process.exit(0);
}

const result = spawnSync("git", ["config", "core.hooksPath", "git-hooks"], {
  encoding: "utf8",
  stdio: ["ignore", "ignore", "pipe"]
});

if (result.status !== 0) {
  console.warn(`[prepare] could not configure git hooks: ${result.stderr.trim()}`);
}
