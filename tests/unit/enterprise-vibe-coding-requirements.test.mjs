import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("production requirements define Bolt-like enterprise vibe coding boundaries", () => {
  const requirements = readFileSync("docs/requirements/production-blueprint-requirements.md", "utf8");

  for (const requirementId of ["FR-CRE-008", "FR-CRE-009", "FR-CRE-010"]) {
    assert.match(requirements, new RegExp(requirementId));
  }

  for (const phrase of [
    "Bolt-like full-stack coding loop",
    "prompt thread",
    "project files/code view",
    "AI diff",
    "terminal/build/test logs",
    "Platform Auth SDK",
    "DB schema contract",
    "IT-owned boundaries",
    "cannot bypass or self-provision"
  ]) {
    assert.match(requirements, new RegExp(escapeRegExp(phrase), "i"));
  }
});

test("traceability matrix covers enterprise vibe coding acceptance tests", () => {
  const rtm = readFileSync("docs/requirements/requirements-traceability-matrix.md", "utf8");

  for (const testCaseId of ["TC-CRE-008", "TC-CRE-009", "TC-CRE-010"]) {
    assert.match(rtm, new RegExp(testCaseId));
  }

  assert.match(rtm, /full-stack AI coding workspace/);
  assert.match(rtm, /independent auth\/user DB\/infra\/secrets/);
  assert.match(rtm, /global infra, auth provider, user directory, DB server or secret material/);
});

test("workspace ADR and UI spec keep code diff terminal behind platform controls", () => {
  const adr = readFileSync("docs/architecture/ADR-007-workspace-task-preview-usage-records.md", "utf8");
  const uiSpec = readFileSync("docs/design/sprint-4-ui-spec.md", "utf8");

  assert.match(adr, /Bolt-like browser workspace/);
  assert.match(adr, /Platform Auth SDK/);
  assert.match(adr, /Artifact Validator/);
  assert.match(adr, /infrastructure, auth, database or secret control/);

  assert.match(uiSpec, /Code \/ Diff/);
  assert.match(uiSpec, /Terminal/);
  assert.match(uiSpec, /Enterprise Lock Boundary/);
  assert.match(uiSpec, /no unrestricted shell access/);
});
