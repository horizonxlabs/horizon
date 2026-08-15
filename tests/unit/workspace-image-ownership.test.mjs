import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("docker/workspace-next.Dockerfile", "utf8");
const entrypoint = readFileSync("docker/workspace-entrypoint.sh", "utf8");

test("workspace image repairs mounted workspace ownership before dropping privileges", () => {
  assert.match(
    dockerfile,
    /COPY docker\/workspace-entrypoint\.sh \/usr\/local\/bin\/workspace-entrypoint/
  );
  // Selective repair: only wrong-owned entries are touched, with the blanket chown as fallback.
  assert.match(entrypoint, /! -user evcp/);
  assert.match(entrypoint, /\|\| chown -R evcp:evcp \/workspace/);
  assert.match(entrypoint, /exec su -s \/bin\/sh evcp -c/);
});

test("warm starts skip npm install via the manifest stamp", () => {
  // Baseline dependencies use the image stamp; customized dependency trees persist their own
  // matching stamp in the project volume.
  assert.match(entrypoint, /node_modules\/\.evcp-install-stamp/);
  assert.match(entrypoint, /cksum/);
  assert.match(entrypoint, /npm install/);
  // The image bakes a matching stamp so even the first boot skips the redundant install.
  assert.match(dockerfile, /\.evcp-install-stamp/);
});

test("fresh no-copy workspaces hydrate source without copying baseline node_modules", () => {
  assert.match(dockerfile, /WORKDIR \/opt\/evcp-template/);
  assert.match(dockerfile, /npm install/);
  assert.match(dockerfile, /WORKDIR \/workspace/);
  assert.match(entrypoint, /\/opt\/evcp-template/);
  assert.match(entrypoint, /--exclude=['"]?node_modules/);
  assert.match(entrypoint, /ln -s \/opt\/evcp-template\/node_modules \/workspace\/node_modules/);
});
