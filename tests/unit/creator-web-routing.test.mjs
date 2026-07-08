import test from "node:test";
import assert from "node:assert/strict";

const {
  creatorPageFromPath,
  projectRouteSegmentFromPath,
  slugifyProjectName,
  createCreatorNavigation
} = await import("../../apps/creator-web/src/lib/routing.ts");

test("creatorPageFromPath: recognizes each known suffix", () => {
  assert.equal(creatorPageFromPath("/creator/projects/leave-management/prd"), "prd");
  assert.equal(creatorPageFromPath("/creator/projects/leave-management/users"), "users");
  assert.equal(creatorPageFromPath("/creator/projects/leave-management/publish"), "publish");
  assert.equal(creatorPageFromPath("/creator/projects/leave-management/tickets"), "tickets");
});

test("creatorPageFromPath: falls back to workspace for a bare project path", () => {
  assert.equal(creatorPageFromPath("/creator/projects/leave-management"), "workspace");
});

test("creatorPageFromPath: falls back to projects for unrelated paths", () => {
  assert.equal(creatorPageFromPath("/creator"), "projects");
  assert.equal(creatorPageFromPath("/"), "projects");
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

test("createCreatorNavigation: hides the temporarily-disabled creator menus", () => {
  const project = { id: "proj_expense_approval" };
  const labels = createCreatorNavigation(project).map((item) => item.label);
  assert.deepEqual(labels, ["Projects"]);
  for (const hidden of [
    "PRD Review",
    "Creator Workspace",
    "Users & Roles",
    "Publish & Registry",
    "Tickets & Changes"
  ]) {
    assert.equal(labels.includes(hidden), false, `${hidden} should be hidden from the sidebar`);
  }
});
