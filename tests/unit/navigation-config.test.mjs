import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function readAllSourceFiles(dir) {
  const entries = readdirSync(dir);
  let combined = "";
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      combined += readAllSourceFiles(fullPath);
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      combined += readFileSync(fullPath, "utf8");
    }
  }
  return combined;
}

test("creator navigation matches the real app creation lifecycle", () => {
  const configSource = readFileSync("packages/config/src/index.ts", "utf8");

  const expectedOrder = [
    "Projects",
    "PRD Review",
    "Creator Workspace",
    "Database",
    "Versions",
    "Users & Roles",
    "Publish & Registry",
    "Deployments",
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
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/database"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/versions"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/users"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/publish"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/deployments"/);
  assert.match(configSource, /route: "\/creator\/projects\/leave-management\/tickets"/);
});

test("admin navigation includes readiness pages", () => {
  const configSource = readFileSync("packages/config/src/index.ts", "utf8");

  assert.match(configSource, /label: "Auth & SSO"/);
  assert.match(configSource, /route: "\/admin\/auth"/);
  assert.match(configSource, /label: "Domains"/);
  assert.match(configSource, /route: "\/admin\/domains"/);
  assert.match(configSource, /label: "Publishing"/);
  assert.match(configSource, /route: "\/admin\/publishing"/);
});

test("Store navigation includes implemented collections and planned account pages", () => {
  const configSource = readFileSync("packages/config/src/index.ts", "utf8");
  for (const [label, route] of [
    ["My Apps", "/store/"],
    ["Available Apps", "/store/available"],
    ["Search", "/store/search"],
    ["Favorites", "/store/favorites"],
    ["Recent", "/store/recent"],
    ["Access Requests", "/store/access-requests"],
    ["Tickets", "/store/tickets"],
    ["Profile", "/store/profile"]
  ]) {
    assert.match(configSource, new RegExp(`label: "${label}"`));
    assert.match(configSource, new RegExp(`route: "${route.replaceAll("/", "\\/")}"`));
  }
});

test("creator project cards open the editing workspace and lifecycle pages exist", () => {
  const creatorSource = readAllSourceFiles("apps/creator-web/src");

  // Clicking a project card opens the editing workspace directly.
  assert.match(creatorSource, /handleSelectProject\(project, "workspace"/);
  // Lifecycle pages remain reachable via navigation and page copy.
  assert.match(creatorSource, /Creator Workspace: Leave Management/);
  assert.match(creatorSource, /Publish & Registry/);
  assert.match(creatorSource, /Tickets & Changes/);
});
