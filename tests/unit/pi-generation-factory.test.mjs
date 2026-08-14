import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultGenerationService } from "../../apps/platform-api/src/generation-loop/factory.ts";

const orchestrator = {
  getWorkspace: (projectId) => ({ id: `ws-${projectId}`, containerId: "container-1" }),
  markActivity() {}
};

test("real generation factory requires structured governed rounds", async () => {
  await assert.rejects(
    createDefaultGenerationService({
      orchestrator,
      env: { EVCP_WORKSPACE_REAL_ADAPTERS: "1" }
    }),
    /structured governed AI executor/i
  );
});

test("factory is Pi-only and exposes no engine selector or completion client", async () => {
  const source = await readFile(
    new URL("../../apps/platform-api/src/generation-loop/factory.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /createPiGenerationService/);
  const forbidden = new RegExp(
    [
      "createGenerationService",
      ["LlmCompletion", "Client"].join(""),
      ["EVCP_AGENT", "ENGINE"].join("_")
    ].join("|")
  );
  assert.doesNotMatch(source, forbidden);
});
