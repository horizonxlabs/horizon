import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, PlatformApiError, success } =
  await import("../../packages/api-client/src/index.ts");

test("platform API client reads Creator workspace snapshots", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://platform.example/api/projects/proj_001/workspace");
      assert.equal(init.headers.get("x-mock-user-email"), "creator@company.com");
      return new Response(
        JSON.stringify(
          success({
            project: { id: "proj_001", name: "Leave Management", slug: "leave-management" },
            baseline: { id: "prdv_001", version: "1.0", isBaseline: true },
            preview: {
              id: "preview_0001",
              version: "preview-0001",
              summary: "Mock preview updated: Add WFH leave type",
              highlights: []
            },
            tasks: [],
            usage: [],
            tokenBudget: { remainingToday: 880, remainingMonth: 4880, requestEstimate: 120 }
          })
        ),
        { status: 200 }
      );
    }
  });

  const workspace = await client.getWorkspace("proj_001");

  assert.equal(workspace.preview.version, "preview-0001");
  assert.equal(workspace.tokenBudget.remainingToday, 880);
});

test("platform API client submits Creator workspace prompts", async () => {
  let observedBody = {};
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    sessionToken: "evcp_session.payload.signature",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://platform.example/api/projects/proj_001/workspace/prompts");
      assert.equal(init.headers.get("authorization"), "Bearer evcp_session.payload.signature");
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            guardrail: { decision: "allow", eventId: "gre_0001" },
            task: {
              id: "wst_0001",
              status: "ready",
              prompt: "Add WFH leave type",
              steps: [
                { id: "wst_0001_step_1", label: "Understanding request", status: "done", order: 1 }
              ]
            },
            preview: {
              id: "preview_0001",
              version: "preview-0001",
              summary: "Mock preview updated: Add WFH leave type",
              highlights: []
            },
            usage: { id: "ailog_0001", tokensUsed: 120, status: "succeeded" },
            tokenBudget: { remainingToday: 880, remainingMonth: 4880, requestEstimate: 120 }
          })
        ),
        { status: 201 }
      );
    }
  });

  const result = await client.submitWorkspacePrompt("proj_001", { prompt: "Add WFH leave type" });

  assert.equal(observedBody.prompt, "Add WFH leave type");
  assert.equal(result.task.status, "ready");
  assert.equal(result.preview.version, "preview-0001");
});

test("platform API client refreshes Creator workspace preview", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      assert.equal(
        String(url),
        "https://platform.example/api/projects/proj_001/workspace/preview/refresh"
      );
      assert.equal(init.method, "POST");
      return new Response(
        JSON.stringify(
          success({
            id: "preview_0001",
            projectId: "proj_001",
            version: "preview-0001",
            summary: "Mock preview updated: Add WFH leave type",
            device: "desktop",
            screenTitle: "Leave Management",
            highlights: ["WFH leave type"],
            createdAt: "2026-07-04T01:00:00.000Z"
          })
        ),
        { status: 200 }
      );
    }
  });

  const preview = await client.refreshWorkspacePreview("proj_001");

  assert.equal(preview.version, "preview-0001");
  assert.match(preview.summary, /WFH leave type/);
});

test("platform API client reads Creator app access snapshots", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://platform.example/api/projects/proj_001/app/users");
      assert.equal(init.headers.get("x-mock-user-email"), "creator@company.com");
      return new Response(
        JSON.stringify(
          success({
            app: {
              id: "app_leave",
              projectId: "proj_001",
              slug: "leave-management",
              name: "Leave Management",
              status: "draft",
              route: "/apps/leave-management"
            },
            roles: [
              {
                id: "role_employee",
                appId: "app_leave",
                key: "employee",
                name: "Employee",
                description: "Request leave",
                permissions: ["leave:request"],
                memberCount: 1
              }
            ],
            members: [
              {
                id: "mem_001",
                appId: "app_leave",
                email: "user@company.com",
                name: "End User",
                userType: "internal",
                roleKey: "employee",
                roleName: "Employee",
                status: "active"
              }
            ],
            invitations: [],
            accessRequests: []
          })
        ),
        { status: 200 }
      );
    }
  });

  const snapshot = await client.getAppAccessSnapshot("proj_001");

  assert.equal(snapshot.app.slug, "leave-management");
  assert.equal(snapshot.roles[0].key, "employee");
});

test("platform API client creates Creator app invitations", async () => {
  let observedBody = {};
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    sessionToken: "evcp_session.payload.signature",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://platform.example/api/projects/proj_001/app/invitations");
      assert.equal(init.headers.get("authorization"), "Bearer evcp_session.payload.signature");
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            id: "appinv_0001",
            appId: "app_leave",
            projectId: "proj_001",
            email: "manager@company.com",
            userType: "internal",
            roleKey: "manager",
            invitedByUserId: "usr_creator",
            status: "pending",
            note: "Join manager queue",
            createdAt: "2026-07-04T01:00:00.000Z"
          })
        ),
        { status: 201 }
      );
    }
  });

  const invite = await client.createAppInvitation("proj_001", {
    email: "manager@company.com",
    roleKey: "manager",
    userType: "internal",
    note: "Join manager queue"
  });

  assert.equal(observedBody.email, "manager@company.com");
  assert.equal(invite.status, "pending");
});

test("platform API client decides Creator app access requests", async () => {
  let observedBody = {};
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      assert.equal(
        String(url),
        "https://platform.example/api/projects/proj_001/app/access-requests/decision"
      );
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            id: "appreq_0001",
            appId: "app_leave",
            projectId: "proj_001",
            requesterEmail: "manager@company.com",
            requestedRoleKey: "manager",
            reason: "Approval queue",
            status: "approved",
            decidedByUserId: "usr_creator",
            decidedAt: "2026-07-04T01:00:00.000Z",
            createdAt: "2026-07-04T00:00:00.000Z"
          })
        ),
        { status: 200 }
      );
    }
  });

  const request = await client.decideAppAccessRequest("proj_001", {
    requestId: "appreq_0001",
    decision: "approved"
  });

  assert.equal(observedBody.requestId, "appreq_0001");
  assert.equal(request.status, "approved");
});

test("platform API client reviews publishes and lists Creator registry entries", async () => {
  const seenUrls = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      seenUrls.push(`${init.method ?? "GET"} ${String(url)}`);
      if (String(url).endsWith("/publish/review")) {
        return new Response(
          JSON.stringify(
            success({
              ready: true,
              manifest: {
                appId: "app_leave",
                manifestVersion: "1",
                app: { slug: "leave-management", route: "/apps/leave-management" },
                roles: []
              },
              checklist: [
                { key: "prd", label: "PRD baseline", status: "pass", detail: "Baseline v1.0" }
              ]
            })
          ),
          { status: 200 }
        );
      }
      if (String(url).endsWith("/publish")) {
        return new Response(
          JSON.stringify(
            success({
              publishRequest: {
                id: "pubreq_0001",
                status: "published",
                blockingItems: [],
                manifestVersion: "1"
              },
              deployment: { id: "dep_0001", status: "published", route: "/apps/leave-management" },
              registryEntry: {
                id: "store_leave",
                slug: "leave-management",
                status: "published",
                route: "/apps/leave-management"
              },
              manifest: { appId: "app_leave", manifestVersion: "1" }
            })
          ),
          { status: 201 }
        );
      }
      return new Response(
        JSON.stringify(
          success([{ id: "store_leave", slug: "leave-management", status: "published" }])
        ),
        { status: 200 }
      );
    }
  });

  const review = await client.getPublishReview("proj_001");
  const result = await client.publishProject("proj_001");
  const registry = await client.listAppStoreRegistry();

  assert.deepEqual(seenUrls, [
    "GET https://platform.example/api/projects/proj_001/publish/review",
    "POST https://platform.example/api/projects/proj_001/publish",
    "GET https://platform.example/api/app-store/registry"
  ]);
  assert.equal(review.ready, true);
  assert.equal(result.deployment.status, "published");
  assert.equal(registry[0].slug, "leave-management");
});

test("workspace container publish routes parse bare (non-enveloped) shapes", async () => {
  const dep = {
    id: "dep-1",
    projectId: "proj_x",
    slug: "proj-x",
    environment: "staging",
    commitSha: "abc1234",
    imageTag: "evcp-staging-proj-x:abc1234",
    containerId: "c1",
    publishedByUserId: "usr_1",
    healthStatus: "healthy",
    createdAt: "2026-07-10T00:00:00.000Z"
  };
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    fetcher: async (url, init) => {
      const path = String(url);
      if (path.endsWith("/deployments")) {
        // raw shape: { deployments: [...] }, NOT the { ok, data } envelope
        return new Response(JSON.stringify({ deployments: [dep] }), { status: 200 });
      }
      if (path.endsWith("/publish")) {
        return new Response(JSON.stringify({ deployment: dep }), { status: 201 });
      }
      if (path.endsWith("/promote")) {
        // bare error shape: { error: "<code>" }
        return new Response(
          JSON.stringify({ error: "no_staging_deployment", message: "no healthy staging" }),
          {
            status: 409
          }
        );
      }
      throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
    }
  });

  const deployments = await client.listDeployments("proj_x");
  assert.equal(deployments.length, 1);
  assert.equal(deployments[0].healthStatus, "healthy");

  const published = await client.publishProject("proj_x", "staging");
  assert.equal(published.deployment.id, "dep-1");

  // The bug: a bare { error } response used to throw "Cannot read properties of undefined
  // (reading 'code')". It must now surface the route's error code.
  await assert.rejects(
    () => client.promoteDeployment("proj_x"),
    (err) => err instanceof PlatformApiError && err.code === "no_staging_deployment"
  );
});
