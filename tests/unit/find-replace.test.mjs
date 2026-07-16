import test from "node:test";
import assert from "node:assert/strict";

const { applyFindReplace } = await import(
  "../../apps/platform-api/src/generation-loop/action-runner.ts"
);

test("replaces the single occurrence, leaving everything else byte-identical", () => {
  const src = "line A\nconst title = 'old';\nline C\n";
  const result = applyFindReplace(src, "const title = 'old';", "const title = 'new';");
  assert.equal(result.ok, true);
  assert.equal(result.content, "line A\nconst title = 'new';\nline C\n");
});

test("fails (not_found) when the snippet is absent — never a silent no-op", () => {
  const result = applyFindReplace("hello world", "missing snippet", "x");
  assert.deepEqual(result, { ok: false, reason: "not_found" });
});

test("fails (ambiguous) when the snippet occurs more than once", () => {
  const result = applyFindReplace("x=1;\nx=1;\n", "x=1;", "x=2;");
  assert.deepEqual(result, { ok: false, reason: "ambiguous" });
});

test("preserves surrounding whitespace/indentation exactly", () => {
  const src = "  a\n    return foo(bar);\n  b\n";
  const result = applyFindReplace(src, "return foo(bar);", "return foo(baz);");
  assert.equal(result.content, "  a\n    return foo(baz);\n  b\n");
});

test("line-trimmed strategy: matches when the model's SEARCH has different indentation", () => {
  const src = "function f() {\n      const x = 1;\n      return x;\n}\n";
  // model emitted the lines with LESS indentation than the file has
  const find = "const x = 1;\nreturn x;";
  // model supplies the intended replacement (with the file's indentation)
  const result = applyFindReplace(src, find, "      const x = 2;\n      return x;");
  assert.equal(result.ok, true);
  assert.equal(result.content, "function f() {\n      const x = 2;\n      return x;\n}\n");
});

test("whitespace-normalized strategy: matches when spacing between tokens was reflowed", () => {
  const src = "const total =   a  +   b ;\n";
  const result = applyFindReplace(src, "const total = a + b", "const total = a + b + c");
  assert.equal(result.ok, true);
  assert.match(result.content, /const total = a \+ b \+ c/);
});

test("block-anchor strategy: matches a multi-line block by its first/last lines", () => {
  const src = "start\n  const a = 1;\n  const b = 2;\n  const c = 3;\nend\n";
  // model's interior differs slightly but anchors (first/last line) match
  const find = "const a = 1;\n  const XX = 999;\n  const c = 3;";
  const result = applyFindReplace(src, find, "const a = 10;\n  const c = 30;");
  assert.equal(result.ok, true);
  assert.match(result.content, /const a = 10;\n  const c = 30;/);
});

test("empty replace deletes the matched snippet (a 'delete this' edit)", () => {
  const src = "  a\n  <h1>Title</h1>\n  b\n";
  const result = applyFindReplace(src, "  <h1>Title</h1>\n", "");
  assert.equal(result.ok, true);
  assert.equal(result.content, "  a\n  b\n");
});

test("escape-normalized strategy: matches when the SEARCH uses \\n escapes for real newlines", () => {
  const src = "const a = 1;\nconst b = 2;\n";
  // model emitted a literal backslash-n instead of an actual newline in the SEARCH
  const find = "const a = 1;\\nconst b = 2;";
  const result = applyFindReplace(src, find, "const a = 9;\nconst b = 8;");
  assert.equal(result.ok, true);
  assert.match(result.content, /const a = 9;\nconst b = 8;/);
});

test("trimmed-boundary: a SEARCH padded with leading/trailing blank lines still matches", () => {
  const src = "header\nconst target = 1;\nfooter\n";
  const result = applyFindReplace(src, "\n\nconst target = 1;\n\n", "const target = 42;");
  assert.equal(result.ok, true);
  assert.match(result.content, /const target = 42;/);
});
