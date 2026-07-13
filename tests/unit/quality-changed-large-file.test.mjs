import assert from "node:assert/strict";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";

import {
  existsAtGitRef,
  getComparisonBaseRef,
  getLargeFileViolations
} from "../../scripts/quality/check-changed.mjs";

const fixture = "tests/unit/.large-file-ratchet-fixture.mjs";
const preExistingFile = "apps/admin-web/src/app/AdminApp.tsx";

test("large-file baseline cannot grandfather paths absent from --staged or --base comparison", () => {
  writeFileSync(fixture, "// fixture\n".repeat(401));

  try {
    assert.equal(existsAtGitRef("HEAD", fixture), false);

    for (const options of [{ staged: true }, { base: "HEAD", staged: false }]) {
      const comparisonBaseRef = getComparisonBaseRef(options);
      const { violations } = getLargeFileViolations([fixture], {
        baseline: { [fixture]: 401 },
        comparisonBaseRef
      });

      assert.equal(violations.length, 1);
      assert.match(violations[0], /was not present in comparison base/);
    }
  } finally {
    if (existsSync(fixture)) rmSync(fixture);
  }
});

test("large-file baseline still grandfathers a path that existed in the comparison base", () => {
  assert.equal(existsAtGitRef("HEAD", preExistingFile), true);

  const { notes, violations } = getLargeFileViolations([preExistingFile], {
    baseline: { [preExistingFile]: Number.MAX_SAFE_INTEGER },
    comparisonBaseRef: getComparisonBaseRef({ staged: true })
  });

  assert.deepEqual(violations, []);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /shrank to/);
});
