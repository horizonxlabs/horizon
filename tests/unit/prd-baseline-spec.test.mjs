import test from "node:test";
import assert from "node:assert/strict";
import { renderBaselineSpec } from "../../apps/platform-api/src/prd/baseline-spec.ts";

const version = (over = {}) => ({
  id: "v1", projectId: "p1", version: "1.0.0", status: "baseline", isBaseline: true,
  sourcePrompt: "", changeSummary: "", generatedBy: { scenario: "prd_generation", providerId: "x", model: "y" },
  sections: [
    { id: "s2", key: "req", title: "Requirements", body: "Must track income and expense.", order: 2 },
    { id: "s1", key: "overview", title: "Overview", body: "An expense tracker.", order: 1 }
  ],
  createdByUserId: "u1", createdAt: "2026-07-21T00:00:00.000Z", ...over
});

test("renders the baseline version's sections to ordered markdown", () => {
  const md = renderBaselineSpec([version()]);
  assert.equal(md, "## Overview\nAn expense tracker.\n\n## Requirements\nMust track income and expense.");
});

test("picks the isBaseline version and ignores drafts", () => {
  const draft = version({ id: "v0", isBaseline: false, status: "draft", sections: [{ id: "d", key: "d", title: "Draft", body: "old", order: 1 }] });
  const md = renderBaselineSpec([draft, version()]);
  assert.match(md, /## Overview/);
  assert.doesNotMatch(md, /Draft/);
});

test("returns null when no baseline version exists", () => {
  const draft = version({ isBaseline: false, status: "draft" });
  assert.equal(renderBaselineSpec([draft]), null);
  assert.equal(renderBaselineSpec([]), null);
});

test("clips an oversized spec and appends a truncation note", () => {
  const big = version({ sections: [{ id: "s", key: "k", title: "T", body: "x".repeat(9000), order: 1 }] });
  const md = renderBaselineSpec([big]);
  assert.ok(md.length <= 8000 + "\n… (spec truncated)".length);
  assert.match(md, /… \(spec truncated\)$/);
});
