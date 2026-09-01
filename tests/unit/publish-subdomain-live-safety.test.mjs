import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const liveTestPath = path.join(repositoryRoot, "tests/live/publish-subdomain-smoke.test.mjs");
const fetchStubPath = path.join(
  repositoryRoot,
  "tests/unit/fixtures/publish-subdomain-live-fetch-stub.mjs"
);

function runLiveHarness({ creatorToken, mode }) {
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "evcp-live-safety-"));
  const tracePath = path.join(temporaryDirectory, "fetch-trace.txt");
  const parentEnvironment = { ...process.env };
  delete parentEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--import", fetchStubPath, "--test", liveTestPath],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...parentEnvironment,
        EVCP_LIVE_BASE_URL: "http://localhost:9800",
        EVCP_LIVE_CREATOR_TOKEN: creatorToken,
        EVCP_LIVE_PROJECT_ID: "prj_live_safety",
        EVCP_LIVE_SUBDOMAIN: "fixround-one",
        EVCP_LIVE_FETCH_STUB_MODE: mode,
        EVCP_LIVE_FETCH_TRACE: tracePath,
        TSX_TSCONFIG_PATH: path.join(repositoryRoot, "tsconfig.test.json")
      }
    }
  );
  const output = `${result.stdout}${result.stderr}`;
  const fetchCount = existsSync(tracePath)
    ? readFileSync(tracePath, "utf8").trim().split("\n").filter(Boolean).length
    : 0;
  rmSync(temporaryDirectory, { recursive: true, force: true });
  return { fetchCount, output, status: result.status };
}

test("live harness rejects a server-returned remote subdomain before launch navigation", () => {
  const result = runLiveHarness({ creatorToken: "safe-test-token", mode: "remote-subdomain" });

  assert.equal(result.status, 1);
  assert.match(result.output, /Live registry returned a non-local subdomain URL/);
  assert.equal(result.fetchCount, 2);
  assert.doesNotMatch(result.output, /FOLLOW_UP_FETCH_OCCURRED/);
});

test("live harness redacts a malformed bearer value rejected during header construction", () => {
  const result = runLiveHarness({
    creatorToken: "secret-left\nsecret-right",
    mode: "malformed-token"
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Live App Store publish request failed/);
  assert.doesNotMatch(result.output, /secret-left|secret-right/);
  assert.equal(result.fetchCount, 1);
});

test("live harness redacts a malformed bearer value rejected by the fallback request", () => {
  const result = runLiveHarness({
    creatorToken: "fallback-secret-left\nfallback-secret-right",
    mode: "malformed-fallback-token"
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /Authenticated fallback app route request failed/);
  assert.doesNotMatch(result.output, /fallback-secret-left|fallback-secret-right|fixture-launch/);
  assert.equal(result.fetchCount, 6);
});
