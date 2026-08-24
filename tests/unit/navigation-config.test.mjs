import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const { navigation } = await import("../../packages/config/src/index.ts");
const { createCreatorNavigation } = await import("../../apps/creator-web/src/app/routes.ts");

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
  const project = { id: "expense-approval" };
  const configuredLabels = navigation.creator.map((item) => item.label);
  const sidebarItems = createCreatorNavigation(project);

  assert.deepEqual(navigation.creator[0], {
    label: "Project",
    route: "/creator/projects/leave-management/project",
    icon: "dashboard"
  });
  assert.equal(configuredLabels.includes("Projects"), false);
  assert.deepEqual(
    sidebarItems.map((item) => item.label),
    [
      "Project",
      "Database",
      "Versions",
      "Users & Roles",
      "Publish & Registry",
      "Deployments",
      "Tickets & Changes",
      "Project Settings"
    ]
  );
  assert.equal(sidebarItems.some((item) => item.label === "Creator Workspace"), false);
  assert.equal(sidebarItems.some((item) => item.label === "PRD Review"), false);
  assert.equal(sidebarItems[0].route, "/creator/projects/expense-approval/project");
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
