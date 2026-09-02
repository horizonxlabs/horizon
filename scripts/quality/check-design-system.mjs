#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const APP_SRC_DIRS = [
  "apps/admin-web/src",
  "apps/creator-web/src",
  "apps/app-store-pwa/src",
  "apps/landing-web/src"
];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"]);
const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\s*\(/;
const INLINE_STYLE_PATTERN = /\bstyle\s*=\s*\{\s*\{/;
const LOCAL_CSS_IMPORT_PATTERN = /import\s+["'][^"']+\.css["']/;
const APPROVED_UI_CSS_IMPORTS = ['import "@evcp/ui/styles.css"', 'import "@evcp/ui/marketing.css"'];
// Next.js requires a CSS entry point, so landing-web gets exactly one stylesheet. It may
// exist only while it does nothing but pull in @evcp/ui and tell Tailwind where to look.
// Validated per statement rather than per line: a line-anchored pattern cannot reject a
// declaration appended after a legal @import, and cannot span a multi-line comment.
const LANDING_CSS_ENTRY = "apps/landing-web/src/app/globals.css";
const ALLOWED_ENTRY_STATEMENT =
  /^@(?:import\s+["']@evcp\/ui\/[a-z0-9.-]+\.css["']|source\s+["'][^"']+["'])$/;
// The App Router only bundles global CSS when the root layout imports it directly, so the
// root layout is the one source file allowed to import the (already-restricted) CSS entry.
const LANDING_ROOT_LAYOUT = "apps/landing-web/src/app/layout.tsx";
const LANDING_ROOT_LAYOUT_CSS_IMPORT = 'import "./globals.css"';

function landingCssEntryViolations(content) {
  // Blank out comments rather than deleting them, so byte offsets — and therefore the
  // reported line numbers — still line up with the original file.
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " ")
  );
  const violations = [];
  for (const match of stripped.matchAll(/[^;\s][^;]*/g)) {
    const statement = match[0].trim();
    if (ALLOWED_ENTRY_STATEMENT.test(statement)) continue;
    violations.push({ line: stripped.slice(0, match.index).split("\n").length, statement });
  }
  return violations;
}
// Match arbitrary VALUES (a utility root immediately followed by `-[`) while NOT
// matching Tailwind variant syntax like `data-[state=open]:`, `aria-[expanded]:`,
// `supports-[...]`, `group-[...]`, `peer-[...]`, `has-[...]` (legit variant prefixes).
const ARBITRARY_VALUE_PATTERN =
  /className\s*=\s*["'`][^"'`]*(?<!\b(?:data|aria|supports|group|peer|has))-\[[^\]]+\]/;
const COLOR_UTILITY_PATTERN =
  /className\s*=\s*["'`][^"'`]*\b(?:bg|text|border|ring|from|via|to|shadow|rounded|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
// Bare color keywords (bg-white, text-black, bg-transparent, border-black, …) are not
// design tokens and must not appear in app code (§6).
const BARE_COLOR_PATTERN =
  /className\s*=\s*["'`][^"'`]*\b(?:bg|text|border)-(?:white|black|transparent)\b/;
// Shadow/radius utilities must come from the design tokens. Only the token utilities
// `shadow-card`, `rounded-card`, `rounded-control`, `rounded-pill` are allowed; every
// other `shadow-<scale>` / `rounded-<scale>` (rounded-full, shadow-lg, …) is rejected.
const NON_TOKEN_SHAPE_PATTERN =
  /className\s*=\s*["'`][^"'`]*\b(?:shadow-(?!card\b)[a-z0-9-]+|rounded-(?!card\b|control\b|pill\b)[a-z0-9-]+)/;

function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...collectFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function normalizePath(file) {
  return relative(process.cwd(), file).replaceAll("\\", "/");
}

function targetFiles(argv) {
  if (argv.length > 0) {
    return argv
      .map((file) => normalizePath(file))
      .filter((file) => APP_SRC_DIRS.some((dir) => file.startsWith(`${dir}/`)))
      .filter((file) => existsSync(file));
  }

  return APP_SRC_DIRS.flatMap(collectFiles).map(normalizePath);
}

function reportViolation(violations, file, lineNumber, message) {
  violations.push(`${file}:${lineNumber}: ${message}`);
}

const files = targetFiles(process.argv.slice(2));
const violations = [];

for (const file of files) {
  const extension = extname(file);
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");

  if (STYLE_EXTENSIONS.has(extension)) {
    if (file === LANDING_CSS_ENTRY) {
      for (const violation of landingCssEntryViolations(content)) {
        reportViolation(
          violations,
          file,
          violation.line,
          "landing-web globals.css may only import @evcp/ui stylesheets and declare @source paths"
        );
      }
      continue;
    }
    reportViolation(
      violations,
      file,
      1,
      "app-local stylesheet detected; put shared styling in packages/ui/styles.css"
    );
    continue;
  }

  if (!SOURCE_EXTENSIONS.has(extension)) continue;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (INLINE_STYLE_PATTERN.test(line)) {
      reportViolation(
        violations,
        file,
        lineNumber,
        "inline visual style detected; use @evcp/ui component classes/tokens"
      );
    }

    if (COLOR_PATTERN.test(line)) {
      reportViolation(
        violations,
        file,
        lineNumber,
        "hardcoded color detected in app layer; move the value to @evcp/ui tokens/styles"
      );
    }

    if (
      LOCAL_CSS_IMPORT_PATTERN.test(line) &&
      !APPROVED_UI_CSS_IMPORTS.some((approved) => line.includes(approved)) &&
      !(file === LANDING_ROOT_LAYOUT && line.includes(LANDING_ROOT_LAYOUT_CSS_IMPORT))
    ) {
      reportViolation(
        violations,
        file,
        lineNumber,
        "local CSS import detected; app surfaces should import only @evcp/ui/styles.css or @evcp/ui/marketing.css"
      );
    }

    if (ARBITRARY_VALUE_PATTERN.test(line)) {
      reportViolation(
        violations,
        file,
        lineNumber,
        "Tailwind arbitrary value detected; use @evcp/ui tokens/components instead"
      );
    }

    if (COLOR_UTILITY_PATTERN.test(line) || BARE_COLOR_PATTERN.test(line)) {
      reportViolation(
        violations,
        file,
        lineNumber,
        "color utility detected in app layer; color/shadow/radius must come from @evcp/ui components"
      );
    }

    if (NON_TOKEN_SHAPE_PATTERN.test(line)) {
      reportViolation(
        violations,
        file,
        lineNumber,
        "non-token shadow/radius utility detected in app layer; use design tokens (shadow-card, rounded-card/control/pill) via @evcp/ui"
      );
    }
  });
}

if (violations.length > 0) {
  console.error("[design-system] UI governance check failed");
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  process.exit(1);
}

console.error("[design-system] UI governance check passed");
