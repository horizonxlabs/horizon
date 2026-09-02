#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET_ROOTS = new Set(["app", "routes", "features", "shared"]);
const LEGACY_ROOTS = new Set(["components", "hooks", "lib", "pages", "data"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const APP_NAMES = ["admin-web", "creator-web", "app-store-pwa", "landing-web"];
const baseline = new Set(
  JSON.parse(readFileSync(resolve(ROOT, "scripts/quality/frontend-legacy-path-baseline.json"), "utf8"))
);

function listSourceFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listSourceFiles(path) : SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

function sourceSpecifiers(source) {
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function sourceContext(file) {
  const normalized = file.replaceAll("\\", "/");
  const match = normalized.match(/^(apps\/[^/]+\/src)\/(.*)$/);
  if (!match) return null;
  if (match[1].startsWith("apps/platform-api/")) return null;
  const segments = match[2].split("/");
  return { srcRoot: resolve(ROOT, match[1]), relativePath: match[2], root: segments[0], segments };
}

function resolveSpecifier(specifier, context, file) {
  if (specifier.startsWith("@/")) return specifier.slice(2).split("/");
  if (!specifier.startsWith(".")) return null;
  const candidate = resolve(dirname(resolve(ROOT, file)), specifier);
  const inside = relative(context.srcRoot, candidate);
  if (inside.startsWith("..") || inside === "") return null;
  return inside.split("/");
}

export function checkFrontendArchitecture(files) {
  const violations = [];
  for (const file of files) {
    const context = sourceContext(file);
    if (!context || !SOURCE_EXTENSIONS.has(extname(file))) continue;
    const isMain = context.relativePath === "main.tsx";
    const isTarget = TARGET_ROOTS.has(context.root);
    const isBaseline = baseline.has(file);
    if (!isMain && !isTarget && !isBaseline) {
      const root = LEGACY_ROOTS.has(context.root) ? context.root : context.root || "source root";
      violations.push(`${file}: new code must use app, features, shared, or routes instead of legacy root ${root}`);
      continue;
    }
    const source = readFileSync(resolve(ROOT, file), "utf8");
    for (const specifier of sourceSpecifiers(source)) {
      if (/^(?:[a-z]+:|#)/i.test(specifier) || specifier.endsWith(".css")) continue;
      const target = resolveSpecifier(specifier, context, file);
      if (!target) continue;
      if (context.root === "shared" && ["app", "features", "routes"].includes(target[0])) {
        violations.push(`${file}: shared modules must not import ${target[0]} modules`);
      }
      const featureName = context.root === "features" ? context.segments[1] : null;
      const targetsFeature = target[0] === "features";
      const targetFeature = target[1];
      const deepFeatureImport = targetsFeature && target.length > 2 && target[2] !== "index";
      if ((context.root === "routes" && deepFeatureImport) || (featureName && featureName !== targetFeature && deepFeatureImport)) {
        violations.push(`${file}: feature imports must use the public @/features/${targetFeature} index.ts API`);
      }
      const isSameFeatureImport =
        featureName && target[0] === "features" && target[1] === featureName;
      if (isTarget && specifier.startsWith(".") && !isSameFeatureImport) {
        violations.push(`${file}: new target-layout code must use @/ aliases`);
      }
    }
  }
  return violations;
}

function appSourceFiles() {
  return APP_NAMES.flatMap((app) =>
    listSourceFiles(resolve(ROOT, "apps", app, "src")).map((path) => relative(ROOT, path).replaceAll("\\", "/"))
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = process.argv.includes("--files")
    ? readFileSync(0, "utf8").split("\0").filter(Boolean)
    : appSourceFiles();
  const violations = checkFrontendArchitecture(files);
  if (violations.length > 0) {
    for (const violation of violations) console.error(`[frontend-architecture] ${violation}`);
    process.exit(1);
  }
  console.log("[frontend-architecture] checks passed");
}
