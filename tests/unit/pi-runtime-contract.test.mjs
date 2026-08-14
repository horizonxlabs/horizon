import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, repositoryRoot), "utf8"));
}

test("Pi and Node versions are pinned for the embedded agent", async () => {
  const root = await readJson("package.json");
  const api = await readJson("apps/platform-api/package.json");

  assert.equal(root.engines.node, ">=22.19.0");
  assert.equal(api.dependencies["@earendil-works/pi-coding-agent"], "0.84.2");
  assert.equal(api.dependencies["@earendil-works/pi-ai"], "0.84.2");

  for (const path of ["platform-api", "workspace-next", "web-app"]) {
    const dockerfile = await readFile(
      new URL(`docker/${path}.Dockerfile`, repositoryRoot),
      "utf8"
    );
    assert.match(dockerfile, /^FROM node:22\.22\.0-alpine/m);
  }

  const notices = await readFile(new URL("THIRD_PARTY_NOTICES.md", repositoryRoot), "utf8");
  assert.match(notices, /@earendil-works\/pi-coding-agent 0\.84\.2/);
  assert.match(notices, /@earendil-works\/pi-ai 0\.84\.2/);
  assert.match(notices, /MIT License/);

  const workspace = await readFile(new URL("pnpm-workspace.yaml", repositoryRoot), "utf8");
  assert.match(workspace, /'@google\/genai': false/);
  assert.match(workspace, /protobufjs: false/);
});
