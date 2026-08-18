import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("docker/workspace-next.Dockerfile", "utf8");
const entrypoint = readFileSync("docker/workspace-entrypoint.sh", "utf8");

test("workspace image repairs mounted workspace ownership before dropping privileges", () => {
  assert.match(dockerfile, /apk add --no-cache[^\n]*util-linux/);
  assert.match(dockerfile, /command -v flock/);
  assert.match(dockerfile, /touch \/var\/lock\/evcp-turn-reclaim\.lock/);
  assert.match(dockerfile, /chown root:root \/var\/lock\/evcp-turn-reclaim\.lock/);
  assert.match(dockerfile, /chmod 600 \/var\/lock\/evcp-turn-reclaim\.lock/);
  assert.match(
    dockerfile,
    /COPY docker\/workspace-entrypoint\.sh \/usr\/local\/bin\/workspace-entrypoint/
  );
  assert.match(entrypoint, /chown root:root \/workspace/);
  assert.match(entrypoint, /chmod 1777 \/workspace/);
  assert.match(entrypoint, /chown -R root:root \/workspace\/\.git/);
  assert.match(entrypoint, /chmod 700 \/workspace\/\.git/);
  assert.match(entrypoint, /non-directory \/workspace\/\.git/);
  assert.match(entrypoint, /find \/workspace\/\.git -type l -print -quit/);
  assert.match(entrypoint, /find \/workspace -xdev -mindepth 1/);
  assert.match(entrypoint, /stat -c %h/);
  assert.match(entrypoint, /supported source hard links are not supported/);
  assert.doesNotMatch(entrypoint, /\.evcp-inode|mktemp|cp "\$source_path"/);
  assert.match(entrypoint, /-path \/workspace\/\.git/);
  assert.match(entrypoint, /chown -h evcp:evcp/);
  assert.doesNotMatch(entrypoint, /chown evcp:evcp \/workspace(?:\s|$)/);
  const gitGuard = entrypoint.indexOf("chown -R root:root /workspace/.git");
  const gitSymlinkGuard = entrypoint.indexOf("find /workspace/.git -type l -print -quit");
  const sourceRepair = entrypoint.indexOf("find /workspace -xdev -mindepth 1");
  const hardlinkGuard = entrypoint.indexOf("link_count=$(stat -c %h");
  const ownershipRepair = entrypoint.indexOf("! -user evcp -exec chown");
  assert.ok(
    gitGuard >= 0 && gitGuard < sourceRepair,
    "restart must secure .git before source repair"
  );
  assert.ok(
    gitSymlinkGuard >= 0 && gitSymlinkGuard < gitGuard,
    "restart must reject internal Git symlinks before recursive metadata ownership repair"
  );
  assert.ok(
    hardlinkGuard >= 0 && hardlinkGuard < ownershipRepair,
    "restart must reject source hard links before source ownership repair"
  );
  assert.ok(
    hardlinkGuard < gitGuard,
    "restart must reject source hard links before Git metadata ownership repair"
  );
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
  assert.match(entrypoint, /ln -sfn \/opt\/evcp-template\/node_modules \/workspace\/node_modules/);
});
