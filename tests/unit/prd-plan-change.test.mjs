import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanChangeRequest } from "../../apps/platform-api/src/prd/plan-change.ts";

test("builds a prompt-sourced change carrying the plan as the proposed requirement", () => {
  const change = buildPlanChangeRequest("p1", "  Add a report page  ", "1. Add /reports\n2. CSV export", "u1", ["core_flows"]);
  assert.equal(change.projectId, "p1");
  assert.equal(change.sourceType, "prompt");
  assert.equal(change.title, "Add a report page");
  assert.equal(change.proposedRequirement, "1. Add /reports\n2. CSV export");
  assert.deepEqual(change.affectedSections, ["core_flows"]);
  assert.deepEqual(change.acceptanceCriteria, []);
  assert.equal(change.riskLevel, "low");
  assert.equal(change.status, "draft");
  assert.equal(change.requestedByUserId, "u1");
  assert.deepEqual(change.decisions, []);
  assert.ok(change.id.length > 0);
  assert.ok(!Number.isNaN(Date.parse(change.createdAt)));
});
