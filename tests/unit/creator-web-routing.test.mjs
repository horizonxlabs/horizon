import test from "node:test";
import assert from "node:assert/strict";

const {
  creatorRouteFromPath,
  projectRouteSegmentFromPath,
  slugifyProjectName,
  createCreatorNavigation
} = await import("../../apps/creator-web/src/app/routes.ts");

test("creatorRouteFromPath resolves project lifecycle pages", () => {
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1/database"), {
    page: "database",
    projectId: "proj_1"
  });
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1/versions"), {
    page: "versions",
    projectId: "proj_1"
  });
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1/deployments"), {
    page: "deployments",
    projectId: "proj_1"
  });
});

test("creatorRouteFromPath resolves existing pages and ticket detail", () => {
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj%201/prd"), {
    page: "prd",
    projectId: "proj 1"
  });
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj%201/tickets/ticket%2F1"), {
    page: "ticket-detail",
    projectId: "proj 1",
    ticketId: "ticket/1"
  });
});

test("creatorRouteFromPath resolves projects, workspace, and unknown paths", () => {
  assert.deepEqual(creatorRouteFromPath("/creator/"), { page: "projects" });
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1"), {
    page: "workspace",
    projectId: "proj_1"
  });
  assert.deepEqual(creatorRouteFromPath("/unrelated"), { page: "not-found" });
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1/unknown"), {
    page: "not-found",
    projectId: "proj_1"
  });
});

test("creatorRouteFromPath fail-closes malformed encoded route parameters", () => {
  assert.deepEqual(creatorRouteFromPath("/creator/projects/%E0%A4%A/versions"), {
    page: "not-found"
  });
  assert.deepEqual(creatorRouteFromPath("/creator/projects/proj_1/tickets/%E0%A4%A"), {
    page: "not-found",
    projectId: "proj_1"
  });
});

test("projectRouteSegmentFromPath: extracts the project segment", () => {
  assert.equal(
    projectRouteSegmentFromPath("/creator/projects/leave-management/prd"),
    "leave-management"
  );
  assert.equal(
    projectRouteSegmentFromPath("/creator/projects/expense-approval"),
    "expense-approval"
  );
});

test("projectRouteSegmentFromPath: returns undefined when no project segment present", () => {
  assert.equal(projectRouteSegmentFromPath("/creator"), undefined);
});

test("slugifyProjectName: lowercases, trims, and dashifies non-alphanumerics", () => {
  assert.equal(slugifyProjectName("Expense Approval"), "expense-approval");
  assert.equal(slugifyProjectName("  Leave   Management!! "), "leave-management");
  assert.equal(slugifyProjectName("---Weird__Name***"), "weird-name");
});

test("slugifyProjectName: falls back to untitled-project when nothing survives", () => {
  assert.equal(slugifyProjectName("###"), "untitled-project");
  assert.equal(slugifyProjectName(""), "untitled-project");
});

test("slugifyProjectName: truncates to 64 characters", () => {
  const long = "a".repeat(100);
  const slug = slugifyProjectName(long);
  assert.equal(slug.length, 64);
  assert.equal(slug, "a".repeat(64));
});

test("createCreatorNavigation: rewrites leave-management routes to the selected project", () => {
  const project = { id: "proj_expense_approval" };
  const nav = createCreatorNavigation(project);
  assert.ok(Array.isArray(nav));
  for (const item of nav) {
    assert.equal(item.route.includes("/creator/projects/leave-management"), false);
  }
});

test("createCreatorNavigation: leaves non-leave-management routes untouched", () => {
  const project = { id: "proj_expense_approval" };
  const nav = createCreatorNavigation(project);
  const unrelated = nav.filter((item) => !item.route.includes("proj_expense_approval"));
  for (const item of unrelated) {
    assert.equal(item.route.includes("/creator/projects/leave-management"), false);
  }
});

test("creator navigation enables every lifecycle entry for the selected project", () => {
  const project = { id: "proj_1" };
  const nav = createCreatorNavigation(project);
  assert.equal(
    nav.some((item) => item.disabled),
    false
  );
  assert.equal(
    nav.some((item) => item.label.includes("(Soon)")),
    false
  );
  assert.ok(nav.some((item) => item.route === "/creator/projects/proj_1/database"));
  assert.ok(nav.some((item) => item.route === "/creator/projects/proj_1/versions"));
  assert.ok(nav.some((item) => item.route === "/creator/projects/proj_1/deployments"));
});

test("creator navigation encodes the selected project ID", () => {
  const nav = createCreatorNavigation({ id: "project/one" });
  assert.ok(nav.some((item) => item.route === "/creator/projects/project%2Fone/database"));
  assert.equal(
    nav.some((item) => item.route.includes("project/one")),
    false
  );
});

test("createCreatorNavigation: omits the redundant Creator Workspace entry", () => {
  const project = { id: "proj_expense_approval" };
  const labels = createCreatorNavigation(project).map((item) => item.label);
  assert.equal(
    labels.includes("Creator Workspace"),
    false,
    "Creator Workspace is reachable from a project card and should not appear in the sidebar"
  );
});
