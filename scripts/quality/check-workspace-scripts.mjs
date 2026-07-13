#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const workspace = YAML.parse(readFileSync("pnpm-workspace.yaml", "utf8"));
const packageGlobs = workspace.packages ?? [];

const requiredRootScripts = [
  "check",
  "check:ci",
  "check:changed",
  "check:staged",
  "check:frontend-architecture",
  "lint",
  "lint:code",
  "lint:repo",
  "typecheck",
  "build",
  "test",
  "test:unit"
];

const failures = [];

for (const scriptName of requiredRootScripts) {
  if (!rootPackage.scripts?.[scriptName]) {
    failures.push(`Root package.json is missing script "${scriptName}"`);
  }
}

function listWorkspacePackageDirs() {
  const dirs = [];
  for (const glob of packageGlobs) {
    if (!glob.endsWith("/*")) {
      continue;
    }
    const baseDir = glob.slice(0, -2);
    if (!existsSync(baseDir)) {
      continue;
    }
    dirs.push(
      ...readdirSync(baseDir)
        .map((name) => join(baseDir, name))
        .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "package.json")))
    );
  }
  return dirs;
}

for (const packageDir of listWorkspacePackageDirs()) {
  const packageJsonPath = join(packageDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  for (const scriptName of ["build", "typecheck"]) {
    if (!packageJson.scripts?.[scriptName]) {
      failures.push(`${packageJsonPath} is missing script "${scriptName}"`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Workspace package scripts are complete");
