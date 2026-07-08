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
