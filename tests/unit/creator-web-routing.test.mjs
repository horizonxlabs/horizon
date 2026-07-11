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

test("createCreatorNavigation: keeps Projects as the only interactive, unlabelled entry", () => {
  const project = { id: "proj_expense_approval" };
  const nav = createCreatorNavigation(project);
  const projectsItem = nav.find((item) => item.label === "Projects");
  assert.ok(projectsItem, "Projects should be present in the sidebar");
  assert.equal(projectsItem.disabled, undefined, "Projects should stay interactive");
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

test("createCreatorNavigation: marks every non-Projects entry as a disabled (Soon) item", () => {
  const project = { id: "proj_expense_approval" };
  const nav = createCreatorNavigation(project);
  for (const item of nav) {
    if (item.label === "Projects") continue;
    assert.match(item.label, / \(Soon\)$/, `${item.label} should be suffixed with (Soon)`);
    assert.equal(item.disabled, true, `${item.label} should be disabled`);
    assert.ok(item.disabledReason, `${item.label} should explain why it is disabled`);
  }
  const soonLabels = nav.filter((i) => i.label !== "Projects").map((i) => i.label);
  assert.deepEqual(soonLabels, [
    "PRD Review (Soon)",
    "Users & Roles (Soon)",
    "Publish & Registry (Soon)",
    "Tickets & Changes (Soon)"
  ]);
});
