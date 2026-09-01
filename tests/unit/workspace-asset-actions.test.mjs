import assert from "node:assert/strict";
import test from "node:test";

const { runWorkspaceAssetAction } = await import(
  "../../apps/platform-api/src/generation-loop/workspace-asset-actions.ts"
);

const template = { name: "nextjs-base", lockedFiles: ["package.json"], files: [] };

function fakeDocker() {
  const calls = [];
  return {
    calls,
    async execInContainer(containerId, cmd) {
      calls.push({ containerId, cmd });
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
}

function scriptsOf(docker) {
  return docker.calls.map((call) => call.cmd.at(-1) ?? "");
}

test("asset write streams base64 in bounded chunks and decodes into place", async () => {
  // 512KB of pseudo-binary (bytes 0..255 repeating) — includes conflict-marker-looking bytes.
  const bytes = Buffer.alloc(512 * 1024, undefined);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 256;
  const base64 = bytes.toString("base64");

  const docker = fakeDocker();
  const result = await runWorkspaceAssetAction({
    docker,
    containerId: "c1",
    template,
    action: { id: "a1", type: "asset", filePath: "public/generated/hero.png", base64 }
  });

  assert.equal(result.ok, true, result.error);
  const scripts = scriptsOf(docker);
  // every exec runs as the workspace user
  for (const call of docker.calls) assert.deepEqual(call.cmd.slice(0, 4), ["su", "-s", "/bin/sh", "evcp"]);
  // Linux MAX_ARG_STRLEN caps a SINGLE argv string at 128KiB (131072) — the whole `su -c`
  // script is one argv, so every script must stay safely under it (observed live:
  // "exec /bin/su: argument list too long" at 200KB chunks).
  for (const script of scripts) assert.ok(script.length < 120_000, `argv too large: ${script.length}`);
  assert.match(scripts[0], /mkdir -p 'public\/generated'/);
  // appended chunks reassemble to the exact base64
  const appended = scripts
    .filter((script) => script.includes(">>"))
    .map((script) => script.match(/printf %s '([A-Za-z0-9+/=]+)'/)?.[1] ?? "")
    .join("");
  assert.equal(appended, base64);
  assert.ok(appended.length > 300_000, "expected multiple chunks");
  const finale = scripts.at(-1);
  assert.match(finale, /base64 -d < 'public\/generated\/hero\.png\.b64\.tmp' > 'public\/generated\/hero\.png'/);
  assert.match(finale, /rm -f 'public\/generated\/hero\.png\.b64\.tmp'/);
  assert.match(result.stdout, /524288 bytes/);
});

test("asset write rejects locked files, unsafe paths, and invalid base64 before any exec", async () => {
  const docker = fakeDocker();
  const locked = await runWorkspaceAssetAction({
    docker,
    containerId: "c1",
    template,
    action: { id: "a1", type: "asset", filePath: "package.json", base64: "aGk=" }
  });
  assert.equal(locked.ok, false);
  assert.match(locked.error, /locked/);

  const traversal = await runWorkspaceAssetAction({
    docker,
    containerId: "c1",
    template,
    action: { id: "a2", type: "asset", filePath: "public/../etc/passwd", base64: "aGk=" }
  });
  assert.equal(traversal.ok, false);

  const invalid = await runWorkspaceAssetAction({
    docker,
    containerId: "c1",
    template,
    action: { id: "a3", type: "asset", filePath: "public/generated/x.png", base64: "!!!not-base64!!!" }
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /base64/i);

  assert.equal(docker.calls.length, 0, "no container exec before validation passes");
});

test("a failing exec surfaces the error and attempts tmp cleanup", async () => {
  const calls = [];
  const docker = {
    calls,
    async execInContainer(containerId, cmd) {
      calls.push({ containerId, cmd });
      const script = cmd.at(-1) ?? "";
      if (script.includes(">>")) return { stdout: "", stderr: "disk full", exitCode: 1 };
      return { stdout: "", stderr: "", exitCode: 0 };
    }
  };
  const result = await runWorkspaceAssetAction({
    docker,
    containerId: "c1",
    template,
    action: { id: "a1", type: "asset", filePath: "public/generated/x.png", base64: "aGVsbG8=" }
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /asset write failed/);
  const lastScript = calls.at(-1)?.cmd.at(-1) ?? "";
  assert.match(lastScript, /rm -f 'public\/generated\/x\.png\.b64\.tmp'/);
});
