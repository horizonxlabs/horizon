#!/usr/bin/env node
// Regenerates scripts/quality/large-file-baseline.json — the per-file ceiling that the large-file
// gate in check-changed.mjs ratchets against. Every tracked .ts/.tsx/.mjs file currently over the
// line limit is recorded at its CURRENT length. The gate then fails any such file that GROWS beyond
// its recorded ceiling, and any brand-new file over the limit. Run this after you intentionally
// shrink (or accept) a large file to lock the new, lower ceiling in — the numbers should only ever
// go down over time.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const LINE_LIMIT = 400;
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs"]);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselinePath = resolve(repoRoot, "scripts/quality/large-file-baseline.json");

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function countLines(file) {
  try {
    const content = readFileSync(resolve(repoRoot, file), "utf8");
    if (content.length === 0) return 0;
    const lines = content.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines.length;
  } catch {
    return 0;
  }
}

const baseline = {};
for (const file of trackedFiles()) {
  const ext = file.slice(file.lastIndexOf("."));
  if (!EXTENSIONS.has(ext)) continue;
  const lineCount = countLines(file);
  if (lineCount > LINE_LIMIT) baseline[file] = lineCount;
}

const sorted = Object.fromEntries(Object.entries(baseline).sort((a, b) => b[1] - a[1]));
writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(
  `[large-file-baseline] wrote ${Object.keys(sorted).length} entries (files over ${LINE_LIMIT} lines) to scripts/quality/large-file-baseline.json`
);
