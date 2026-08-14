import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("Coding AI has no legacy engine or markup parser", async () => {
  const forbidden = new RegExp(
    [
      ["EVCP_AGENT", "ENGINE"].join("_"),
      ["LlmCompletion", "Client"].join(""),
      ["createMessage", "Parser"].join(""),
      ["governed", "Completion"].join(""),
      ["<action", " type="].join("")
    ].join("|")
  );

  const generationFiles = await readdir("apps/platform-api/src/generation-loop", {
    recursive: true
  });
  const files = [
    ...generationFiles
      .filter((path) => path.endsWith(".ts"))
      .map((path) => `apps/platform-api/src/generation-loop/${path}`),
    "apps/platform-api/src/app-factory.ts"
  ];
  const matches = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (forbidden.test(source)) matches.push(file);
  }
  assert.deepEqual(matches, []);
});
