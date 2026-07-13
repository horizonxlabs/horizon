import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Audit evidence is owned by the audit-monitoring feature", () => {
  const featureApi = readFileSync("apps/admin-web/src/features/audit-monitoring/index.ts", "utf8");
  const section = readFileSync(
    "apps/admin-web/src/features/audit-monitoring/AuditEvidenceSection.tsx",
    "utf8"
  );
  const main = readFileSync("apps/admin-web/src/features/admin-console/AdminConsole.tsx", "utf8");

  assert.match(featureApi, /AuditEvidenceSection/);
  assert.match(section, /Governance evidence search/);
  assert.match(main, /from "@\/features\/audit-monitoring"/);
  assert.doesNotMatch(main, /const auditFilterRows/);
});
