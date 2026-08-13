import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MemoryWorkspacePersistenceClient,
  createWorkspaceRepositoryBackedService
} from "../../apps/platform-api/src/persistence/workspace-repositories.ts";

const appFactory = readFileSync("apps/platform-api/src/app-factory.ts", "utf8");
const workspaceFilesRoute = readFileSync(
  "apps/platform-api/src/generation-loop/workspace-files-route.ts",
  "utf8"
);
const persistenceDoc = readFileSync("docs/operations/real-mvp-persistence.md", "utf8");

const creatorActor = {
  id: "usr_creator",
  email: "creator@company.com",
  name: "Creator User",
  role: "creator",
  status: "active",
  permissions: ["project:create", "workspace:write"]
};

const project = {
  id: "prj_workspace_persisted",
  slug: "workspace-persisted",
  name: "Workspace Persisted",
  status: "draft",
  ownerUserId: "usr_creator",
  appType: "Workflow App",
  businessProblem: "Employees need persisted workspace state",
  targetDepartment: "HR Department",
  intendedUsers: ["Employee", "Manager"],
  dataSensitivity: "internal",
  appId: "app_workspace_persisted",
  createdAt: "2026-07-04T00:00:00.000Z"
};

const baseline = {
  id: "prdver_workspace_persisted_baseline",
  projectId: project.id,
  version: "1.0",
  status: "baseline",
  isBaseline: true,
  sourcePrompt: "Create a PRD.",
  changeSummary: "Baseline confirmed",
  generatedBy: { scenario: "prd_generation", providerId: "aip_openai", model: "gpt-4.1-mini" },
  sections: [
    { id: "prdsec_overview", key: "overview", title: "Overview", body: "Baseline PRD", order: 1 }
  ],
  createdByUserId: "usr_creator",
  createdAt: "2026-07-04T00:00:00.000Z"
};

const allowGuardrail = {
  decision: "allow",
  severity: "info",
  eventId: "gre_workspace_allow"
};

const blockGuardrail = {
  decision: "block",
  severity: "high",
  eventId: "gre_workspace_block",
  matchedRule: {
    id: "grd_block_payroll",
    name: "Block payroll",
    type: "keyword",
    pattern: "payroll",
    severity: "high",
    action: "block",
    scope: "organization",
    status: "active",
    updatedAt: "2026-07-04T00:00:00.000Z"
  }
};

test("Workspace persistence service stores prompt task preview and usage records", async () => {
  const service = createWorkspaceRepositoryBackedService(new MemoryWorkspacePersistenceClient());

  const result = await service.submitPrompt(creatorActor, {
    project,
    baseline,
    prompt: "Add WFH leave type",
    guardrail: allowGuardrail,
    route: { providerId: "aip_openai", model: "gpt-4.1-mini" },
    tokensUsed: 120
  });
  const snapshot = await service.getWorkspace(creatorActor, { project, baseline });

  assert.equal(result.guardrail.decision, "allow");
  assert.equal(result.task.status, "ready");
  assert.equal(result.task.steps.at(-1)?.status, "done");
  assert.match(result.preview.summary, /WFH leave type/);
  assert.equal(result.usage.tokensUsed, 120);
  assert.equal(snapshot.preview.id, result.preview.id);
  assert.equal(
    snapshot.tasks.some((task) => task.id === result.task.id),
    true
  );
  assert.equal(
    snapshot.usage.some((usage) => usage.id === result.usage.id),
    true
  );
  assert.equal(snapshot.tokenBudget.remainingToday, 880);
});

test("Workspace persistence service stores blocked task without replacing preview or usage", async () => {
  const service = createWorkspaceRepositoryBackedService(new MemoryWorkspacePersistenceClient());
  await service.submitPrompt(creatorActor, {
    project,
    baseline,
    prompt: "Add WFH leave type",
    guardrail: allowGuardrail,
    route: { providerId: "aip_openai", model: "gpt-4.1-mini" },
    tokensUsed: 120
  });

  const blocked = await service.blockPrompt(creatorActor, {
    project,
    baseline,
    prompt: "Add payroll export button",
    guardrail: blockGuardrail
  });
  const snapshot = await service.getWorkspace(creatorActor, { project, baseline });

  assert.equal(blocked.guardrail.decision, "block");
  assert.equal(blocked.task.status, "blocked");
  assert.match(blocked.preview.summary, /WFH leave type/);
  assert.equal(
    snapshot.tasks.some((task) => task.id === blocked.task.id && task.status === "blocked"),
    true
  );
  assert.equal(
    snapshot.usage.some((usage) => usage.prompt === "Add payroll export button"),
    false
  );
});

test("Workspace persistence exposes the latest validated code checkpoint as a publishable preview", async () => {
  const client = new MemoryWorkspacePersistenceClient();
  client.workspaceCodeCheckpoint = {
    async findMany({ where }) {
      assert.equal(where.projectId, project.id);
      return [
        {
          id: "wcp_sales_dashboard_1",
          projectId: project.id,
          tag: "checkpoint/abc123def456",
          commitSha: "abc123def4567890",
          label: "Build the sales dashboard",
          createdAt: new Date("2026-08-13T12:00:00.000Z")
        }
      ];
    }
  };
  const service = createWorkspaceRepositoryBackedService(client);

  const preview = await service.refreshPreview(creatorActor, { project, baseline });

  assert.equal(preview.id, "preview_wcp_sales_dashboard_1");
  assert.equal(preview.version, "preview-abc123def456");
  assert.match(preview.summary, /Build the sales dashboard/);
  assert.match(preview.highlights.join(" "), /abc123def456/);
});

test("runtime persistence wiring exposes Workspace service and routes", () => {
  assert.match(appFactory, /workspacePersistence\?: WorkspaceRepositoryBackedService/);
  assert.match(
    appFactory,
    /createWorkspaceRepositoryBackedService\(\s*new MemoryWorkspacePersistenceClient\(\)\s*\)/
  );
  assert.match(appFactory, /createPrismaWorkspacePersistence\(\s*env\.DATABASE_URL\s*\)/);
  assert.match(appFactory, /isPersistenceWorkspaceRoute/);
  assert.match(workspaceFilesRoute, /\/projects\/:projectId\/workspace\/files/);
  assert.match(workspaceFilesRoute, /listWorkspaceFiles/);
  assert.match(persistenceDoc, /Workspace Route-Level Coverage/);
});
