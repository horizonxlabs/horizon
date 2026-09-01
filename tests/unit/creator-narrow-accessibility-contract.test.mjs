import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile("packages/ui/styles.css", "utf8");

function declarationsFor(selector, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? "";
}

test("Users & Roles contains intrinsic widths and owns table overflow", () => {
  assert.doesNotMatch(declarationsFor(".admin-page-stack"), /min-width:\s*0/);
  assert.match(declarationsFor(".creator-access-stack"), /min-width:\s*0/);
  assert.match(declarationsFor(".creator-access-page"), /min-width:\s*0/);
  assert.match(declarationsFor(".creator-access-page > *"), /min-width:\s*0/);

  const accessBreakpoint = css.slice(
    css.indexOf("@media (max-width: 768px)", css.indexOf(".creator-access-page")),
    css.indexOf(".creator-ticket-inbox-shell")
  );
  const tableWrap = declarationsFor(".creator-access-page .ds-table-wrap", accessBreakpoint);
  assert.match(tableWrap, /width:\s*100%/);
  assert.match(tableWrap, /overflow-x:\s*auto/);
});

test("narrow Creator controls meet the 44px target contract", () => {
  const narrowStart = css.indexOf("@media (max-width: 760px)", css.indexOf(".creator-state"));
  const narrowControls = css.slice(narrowStart, narrowStart + 1800);
  assert.match(
    narrowControls,
    /\.creator-state summary,[\s\S]*?\.creator-status-message summary\s*\{[\s\S]*?min-height:\s*44px/
  );
  assert.match(
    narrowControls,
    /\.creator-publish-retry button\s*\{[\s\S]*?min-height:\s*44px/
  );

  const projectsStart = css.indexOf("@media (max-width: 640px)", css.indexOf(".hz-projects-studio"));
  const projectControls = css.slice(projectsStart, projectsStart + 1500);
  assert.match(
    projectControls,
    /\.hz-projects-studio \.hz-hero button,[\s\S]*?\.hz-projects-tools input\s*\{[\s\S]*?min-height:\s*44px/
  );

  const accessBreakpoint = css.slice(
    css.indexOf("@media (max-width: 768px)", css.indexOf(".creator-access-page")),
    css.indexOf(".creator-ticket-inbox-shell")
  );
  assert.match(
    accessBreakpoint,
    /\.creator-access-page button\s*\{[\s\S]*?min-height:\s*44px/
  );
});
