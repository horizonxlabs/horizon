#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const BINARY_EXTENSIONS = new Set([".ico", ".jpeg", ".jpg", ".png", ".webp", ".woff", ".woff2"]);

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "inherit"]
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

function hasBinaryExtension(file) {
  const dotIndex = file.lastIndexOf(".");
  return dotIndex >= 0 && BINARY_EXTENSIONS.has(file.slice(dotIndex).toLowerCase());
}

const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : trackedFiles();
const failures = [];

for (const file of files) {
  if (hasBinaryExtension(file)) {
    continue;
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (/^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/u.test(lines[index])) {
      failures.push(`${file}:${index + 1}: merge conflict marker`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("No merge conflict markers found");
