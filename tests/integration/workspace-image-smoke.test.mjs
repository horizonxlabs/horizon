import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const LIVE = process.env.EVCP_DOCKER_LIVE === "1";

test("evcp/workspace-next:1 image exists and runs as non-root serving on 3000", { skip: !LIVE }, () => {
  // image is present
  const images = execFileSync("docker", ["images", "--format", "{{.Repository}}:{{.Tag}}"]).toString();
  assert.ok(images.includes("evcp/workspace-next:1"), "expected evcp/workspace-next:1 to be built");

  // runs non-root
  const whoami = execFileSync("docker", ["run", "--rm", "evcp/workspace-next:1", "whoami"]).toString().trim();
  assert.notEqual(whoami, "root", "workspace container must run as a non-root user");

  // boots a server that answers on 3000 (start detached, poll, then clean up)
  const cid = execFileSync("docker", ["run", "-d", "--rm", "evcp/workspace-next:1"]).toString().trim();
  try {
    let ok = false;
    for (let i = 0; i < 30; i += 1) {
      try {
        const code = execFileSync("docker", [
          "exec", cid, "sh", "-c",
          "wget -q -O /dev/null http://127.0.0.1:3000/ && echo up || (node -e \"require('http').get('http://127.0.0.1:3000/',r=>{process.exit(r.statusCode<500?0:1)}).on('error',()=>process.exit(1))\" && echo up)",
        ]).toString();
        if (code.includes("up")) { ok = true; break; }
      } catch { /* not ready yet */ }
      execFileSync("sleep", ["1"]);
    }
    assert.ok(ok, "dev server did not answer on :3000 within 30s");
  } finally {
    execFileSync("docker", ["rm", "-f", cid]);
  }
});
