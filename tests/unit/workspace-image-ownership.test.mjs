import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("docker/workspace-next.Dockerfile", "utf8");

test("workspace image repairs mounted workspace ownership before dropping privileges", () => {
  assert.match(dockerfile, /COPY docker\/workspace-entrypoint\.sh \/usr\/local\/bin\/workspace-entrypoint/);
  const entrypoint = readFileSync("docker/workspace-entrypoint.sh", "utf8");
  assert.match(entrypoint, /chown -R evcp:evcp \/workspace/);
  assert.match(entrypoint, /exec su -s \/bin\/sh evcp -c/);
});
