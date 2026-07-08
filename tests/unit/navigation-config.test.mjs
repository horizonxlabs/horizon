import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("creator navigation matches the real app creation lifecycle", () => {
  const configSource = readFileSync("packages/config/src/index.ts", "utf8");

  const expectedOrder = [
    "Projects",
    "PRD Review",
    "Creator Workspace",
    "Users & Roles",
    "Publish & Registry",
    "Tickets & Changes"
  ];

  let previousIndex = -1;
  for (const label of expectedOrder) {
    const index = configSource.indexOf(`label: "${label}"`);
    assert.ok(index > previousIndex, `${label} should appear after the previous creator menu item`);
    previousIndex = index;
  }

  assert.match(configSource, /route: "\/creator\/"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/prd"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/users"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/publish"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/tickets"/);
});

test("creator project actions follow PRD before AI workspace generation", () => {
  const creatorSource = readFileSync("apps/creator-web/src/main.tsx", "utf8");

  assert.match(creatorSource, /Review PRD/);
  assert.match(creatorSource, /Open Creator Workspace/);
  assert.match(creatorSource, /Creator Workspace: Leave Management/);
  assert.match(creatorSource, /Publish & Registry/);
  assert.match(creatorSource, /Tickets & Changes/);
});
