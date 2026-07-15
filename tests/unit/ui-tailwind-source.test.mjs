import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

// Guard: every other UI test asserts emitted class-name STRINGS from
// renderToStaticMarkup — none prove Tailwind actually generates the CSS for
// packages/ui utilities. packages/ui is symlinked under node_modules, which
// Tailwind ignores by default, so the `@source "./src"` directive in
// packages/ui/styles.css is the ONLY thing that makes design-system utilities
// compile. If that line were removed, every string-matching test would still
// pass while all three apps rendered unstyled primitives. This test builds an
// app and asserts that packages/ui-ONLY utilities landed in the emitted CSS, so
// a regression on `@source` fails loudly here.
test("Tailwind compiles @evcp/ui design-system utilities into app CSS", () => {
  execFileSync("pnpm", ["--filter", "@evcp/admin-web", "build"], {
    cwd: process.cwd(),
    stdio: "pipe"
  });
  const dir = "apps/admin-web/dist/assets";
  const css = readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
    .join("");
  for (const rule of [".bg-primary", ".rounded-control", ".border-border"]) {
    assert.ok(
      css.includes(rule),
      `expected ${rule} to be compiled (is @source "./src" present in packages/ui/styles.css?)`
    );
  }
});
