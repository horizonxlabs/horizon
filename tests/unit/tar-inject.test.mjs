import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  injectTarEntries,
  extractFirstFileContent
} from "../../apps/platform-api/src/workspace-orchestrator/tar-inject.ts";

// Build a minimal valid tar (one file entry + terminator) the same way a real archive looks,
// using system `tar` so the fixture is independent of the code under test.
function makeBaseTar(entries) {
  const dir = mkdtempSync(join(tmpdir(), "tarbase-"));
  try {
    const names = [];
    for (const [name, content] of Object.entries(entries)) {
      writeFileSync(join(dir, name), content);
      names.push(name);
    }
    // COPYFILE_DISABLE stops macOS bsdtar from prepending `._name` AppleDouble entries — junk the
    // Linux Docker daemon never emits, so the fixture matches production archives.
    return execFileSync("tar", ["-cf", "-", "-C", dir, ...names], {
      env: { ...process.env, COPYFILE_DISABLE: "1" },
      maxBuffer: 64 * 1024 * 1024
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function extract(tarBuffer) {
  const dir = mkdtempSync(join(tmpdir(), "tarout-"));
  try {
    const tarPath = join(dir, "ctx.tar");
    writeFileSync(tarPath, tarBuffer);
    const out = join(dir, "out");
    execFileSync("mkdir", ["-p", out]);
    execFileSync("tar", ["-xf", tarPath, "-C", out]);
    const read = (name) => readFileSync(join(out, name), "utf8");
    return { read };
  } finally {
    // leave dir for GC of test process; nothing sensitive
  }
}

test("injects new files that extract with correct content", () => {
  const base = makeBaseTar({ "package.json": '{"name":"app"}\n' });
  const merged = injectTarEntries(base, [
    { name: "Dockerfile", content: "FROM node:20-alpine\nCMD [\"npm\",\"start\"]\n" },
    { name: ".dockerignore", content: "node_modules\n.next\n.git\n" }
  ]);
  const { read } = extract(merged);
  assert.equal(read("package.json"), '{"name":"app"}\n');
  assert.match(read("Dockerfile"), /npm.*start/);
  assert.equal(read(".dockerignore"), "node_modules\n.next\n.git\n");
});

test("injected entry overrides a same-named entry (last wins)", () => {
  const base = makeBaseTar({ Dockerfile: "FROM scratch\n" });
  const merged = injectTarEntries(base, [
    { name: "Dockerfile", content: "FROM node:20-alpine\n" }
  ]);
  const { read } = extract(merged);
  assert.equal(read("Dockerfile"), "FROM node:20-alpine\n");
});

test("empty file list returns the tar unchanged", () => {
  const base = makeBaseTar({ "a.txt": "hi\n" });
  const merged = injectTarEntries(base, []);
  assert.equal(Buffer.compare(merged, base), 0);
});

test("extractFirstFileContent returns the inner file bytes from an outer tar", () => {
  // Mirror `GET /archive?path=/tmp/ctx.tar`: a single file wrapped in an outer tar. The inner
  // content is itself a (small) tar in production, but any bytes must round-trip exactly.
  const inner = Buffer.concat([Buffer.from("inner-tar-bytes\n"), Buffer.alloc(600, 7)]);
  const outer = makeBaseTar({ "ctx.tar": inner.toString("binary") });
  const extracted = extractFirstFileContent(outer);
  assert.equal(Buffer.compare(extracted, inner), 0);
});

test("handles content whose length is an exact 512 multiple", () => {
  const exact = "x".repeat(512);
  const base = makeBaseTar({ "a.txt": "a\n" });
  const merged = injectTarEntries(base, [{ name: "big.txt", content: exact }]);
  const { read } = extract(merged);
  assert.equal(read("big.txt"), exact);
  assert.equal(read("a.txt"), "a\n");
});
