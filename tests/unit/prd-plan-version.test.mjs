import test from "node:test";
import assert from "node:assert/strict";
import { createPlanVersionRecorder } from "../../apps/platform-api/src/prd/plan-version.ts";

function fakePrds(sectionKeys) {
  const captured = {};
  return {
    captured,
    getCurrent: () => ({ sections: sectionKeys.map((key, i) => ({ id: key, key, title: key, body: "", order: i + 1 })) }),
    createVersionFromChange: (_actor, _projectId, change) => {
      captured.change = change;
      return { id: "v2", version: "1.1", isBaseline: false, changeSummary: change.title, sections: [] };
    }
  };
}

test("records against the core_flows section when present, deriving the title from the plan", async () => {
  const prds = fakePrds(["overview", "core_flows", "nfr"]);
  const version = await createPlanVersionRecorder(prds)({ id: "u1" }, "p1", "Add a monthly report page\nwith CSV export");
  assert.deepEqual(prds.captured.change.affectedSections, ["core_flows"]);
  assert.equal(prds.captured.change.sourceType, "prompt");
  assert.equal(prds.captured.change.proposedRequirement, "Add a monthly report page\nwith CSV export");
  assert.equal(prds.captured.change.title, "Add a monthly report page");
  assert.equal(prds.captured.change.requestedByUserId, "u1");
  assert.equal(version.id, "v2");
});

test("falls back to the first section when there is no core_flows", async () => {
  const prds = fakePrds(["overview", "nfr"]);
  await createPlanVersionRecorder(prds)({ id: "u1" }, "p1", "Tweak the header");
  assert.deepEqual(prds.captured.change.affectedSections, ["overview"]);
});

test("uses a fallback title when the plan text is blank", async () => {
  const prds = fakePrds(["core_flows"]);
  await createPlanVersionRecorder(prds)({ id: "u1" }, "p1", "   ");
  assert.equal(prds.captured.change.title, "Approved plan");
});
