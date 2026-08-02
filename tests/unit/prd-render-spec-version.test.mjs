import test from "node:test";
import assert from "node:assert/strict";
import { renderSpecVersion } from "../../apps/platform-api/src/prd/baseline-spec.ts";

const version = (sections) => ({ id: "v", isBaseline: false, sections });

test("renders a version's sections to ordered markdown", () => {
  const md = renderSpecVersion(version([
    { id: "s2", key: "req", title: "Requirements", body: "Track income.", order: 2 },
    { id: "s1", key: "overview", title: "Overview", body: "A tracker.", order: 1 }
  ]));
  assert.equal(md, "## Overview\nA tracker.\n\n## Requirements\nTrack income.");
});

test("returns null for a missing version", () => {
  assert.equal(renderSpecVersion(null), null);
  assert.equal(renderSpecVersion(undefined), null);
});

test("clips an oversized version and appends a truncation note", () => {
  const md = renderSpecVersion(version([{ id: "s", key: "k", title: "T", body: "x".repeat(9000), order: 1 }]));
  assert.ok(md.length <= 8000 + "\n… (spec truncated)".length);
  assert.match(md, /… \(spec truncated\)$/);
});
