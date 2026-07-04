import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, createPlatformSessionStore, PlatformApiError, success, failure } = await import("../../packages/api-client/src/index.ts");

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
}

test("platform API client sends bearer session tokens", async () => {
  let observedAuthorization = "";
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    sessionToken: "evcp_session.payload.signature",
    fetcher: async (_url, init) => {
      observedAuthorization = init.headers.get("authorization");
      return new Response(
        JSON.stringify(
          success({
            user: { id: "usr_admin", name: "Admin User", email: "admin@company.com", role: "admin" },
            permissions: ["platform:admin"],
            auth: { mode: "platform_session", legacyMockFallback: false }
          })
        ),
        { status: 200 }
      );
    }
  });

  const result = await client.getCurrentUser();

  assert.equal(observedAuthorization, "Bearer evcp_session.payload.signature");
  assert.equal(result.user.email, "admin@company.com");
  assert.equal(result.auth.mode, "platform_session");
});

test("platform API client sends explicit legacy mock header only when configured", async () => {
  let observedUser = "";
  let observedAuthorization = "";
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api/",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      observedUser = init.headers.get("x-mock-user-email");
      observedAuthorization = init.headers.get("authorization") ?? "";
      assert.equal(String(url), "https://platform.example/api/projects");
      return new Response(JSON.stringify(success([{ id: "proj_001", name: "Leave Management" }])), { status: 200 });
    }
  });

  const projects = await client.listProjects();

  assert.equal(observedUser, "creator@company.com");
  assert.equal(observedAuthorization, "");
  assert.equal(projects[0].name, "Leave Management");
});

test("platform API client throws typed errors for failure envelopes", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    fetcher: async () =>
      new Response(JSON.stringify(failure("FORBIDDEN", "Admin role required", "trace_001")), {
        status: 403
      })
  });

  await assert.rejects(() => client.listStoreApps(), {
    name: "PlatformApiError",
    code: "FORBIDDEN",
    message: "Admin role required",
    traceId: "trace_001",
    status: 403
  });

  assert.equal(PlatformApiError.name, "PlatformApiError");
});

test("platform session store saves loads and clears browser tokens", () => {
  const store = createPlatformSessionStore(createMemoryStorage());

  store.saveSession({
    token: "evcp_session.payload.signature",
    expiresAt: "2026-07-04T02:00:00.000Z"
  });

  assert.equal(store.getToken(), "evcp_session.payload.signature");
  assert.equal(store.getExpiresAt(), "2026-07-04T02:00:00.000Z");

  store.clearSession();

  assert.equal(store.getToken(), undefined);
  assert.equal(store.getExpiresAt(), undefined);
});

test("platform API client posts simulated SSO login payloads through the bridge endpoint", async () => {
  let observedUrl = "";
  let observedBody = {};
  let observedAdminHeader = "";
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observedUrl = String(url);
      observedAdminHeader = init.headers.get("x-mock-user-email");
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            id: "psess_0001",
            providerId: "authprov_keycloak_default_001",
            providerType: "keycloak",
            token: "evcp_session.payload.signature",
            claims: {
              subject: "keycloak-creator-ui-bridge",
              email: "creator@company.com",
              name: "Creator User",
              groups: ["evcp-creators"],
              platformRoles: ["creator"],
              appRoles: { "leave-management": ["HR Admin"] }
            },
            issuedAt: "2026-07-04T01:00:00.000Z",
            expiresAt: "2026-07-04T02:00:00.000Z"
          })
        ),
        { status: 201 }
      );
    }
  });

  const session = await client.simulateSsoLogin({
    subject: "keycloak-creator-ui-bridge",
    email: "creator@company.com",
    name: "Creator User",
    groups: ["evcp-creators"],
    appRoles: { "leave-management": ["HR Admin"] }
  });

  assert.equal(observedUrl, "https://platform.example/api/admin/auth/simulate-login");
  assert.equal(observedAdminHeader, "admin@company.com");
  assert.equal(observedBody.providerId, "authprov_keycloak_default_001");
  assert.equal(observedBody.email, "creator@company.com");
  assert.deepEqual(observedBody.groups, ["evcp-creators"]);
  assert.equal(session.token, "evcp_session.payload.signature");
});

test("platform API client posts installer preflight profiles", async () => {
  let observedUrl = "";
  let observedBody = {};
  let observedAdminHeader = "";
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observedUrl = String(url);
      observedAdminHeader = init.headers.get("x-mock-user-email");
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            id: "instrep_0001",
            status: "passed",
            installBlocked: false,
            checks: [],
            actionableFailures: [],
            reportPath: "reports/install/passed-install-report.json"
          })
        ),
        { status: 201 }
      );
    }
  });

  const report = await client.runInstallerPreflight({
    cpuCores: 8,
    memoryGb: 32,
    diskFreeGb: 500,
    os: "ubuntu-22.04",
    dockerVersion: "26.1.0",
    composeVersion: "2.27.0",
    portsAvailable: [80, 443, 5432, 6379, 9000],
    dnsReady: true,
    tlsReady: true,
    networkReady: true
  });

  assert.equal(observedUrl, "https://platform.example/api/admin/installer/preflight");
  assert.equal(observedAdminHeader, "admin@company.com");
  assert.equal(observedBody.cpuCores, 8);
  assert.equal(observedBody.tlsReady, true);
  assert.equal(report.status, "passed");
});

test("platform API client saves installer setup and returns masked evidence", async () => {
  let observedUrl = "";
  let observedBody = {};
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    sessionToken: "evcp_session.payload.signature",
    fetcher: async (url, init) => {
      observedUrl = String(url);
      assert.equal(init.headers.get("authorization"), "Bearer evcp_session.payload.signature");
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            id: "setup_0001",
            status: "completed",
            domain: "platform.company.test",
            databaseUrlMasked: "postgresql://evcp:***@postgres:5432/evcp",
            storage: { provider: "minio", endpoint: "http://minio:9000", bucket: "evcp-artifacts" },
            auth: { mode: "keycloak", issuerUrl: "http://keycloak:8080/realms/evcp" },
            ai: { providerId: "aip_openai", model: "gpt-4.1" },
            guardrail: { defaultPolicy: "enterprise-default" },
            backup: { schedule: "0 2 * * *", retentionDays: 30 },
            firstAdmin: { email: "admin@company.com" },
            createdAt: "2026-07-04T01:00:00.000Z"
          })
        ),
        { status: 201 }
      );
    }
  });

  const setup = await client.saveInstallerSetup({
    domain: "platform.company.test",
    databaseUrl: "postgresql://evcp:secret@postgres:5432/evcp",
    storage: { provider: "minio", endpoint: "http://minio:9000", bucket: "evcp-artifacts", secretAccessKey: "secret" },
    auth: { mode: "keycloak", issuerUrl: "http://keycloak:8080/realms/evcp" },
    ai: { providerId: "aip_openai", model: "gpt-4.1" },
    guardrail: { defaultPolicy: "enterprise-default", blockHighRisk: true },
    backup: { schedule: "0 2 * * *", retentionDays: 30 },
    firstAdmin: { email: "admin@company.com", displayName: "Platform Admin" }
  });

  assert.equal(observedUrl, "https://platform.example/api/admin/installer/setup");
  assert.equal(observedBody.storage.secretAccessKey, "secret");
  assert.match(setup.databaseUrlMasked, /\*\*\*/);
  assert.equal(setup.storage.secretAccessKey, undefined);
});

test("platform API client retrieves installer reports", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://platform.example/api/admin/installer/reports");
      assert.equal(init.headers.get("x-mock-user-email"), "admin@company.com");
      return new Response(JSON.stringify(success([{ id: "instrep_0001", status: "passed", installBlocked: false }])), { status: 200 });
    }
  });

  const reports = await client.listInstallerReports();

  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, "passed");
});

test("platform API client reads App Store app detail", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "user@company.com",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://platform.example/api/store/apps/leave-management");
      assert.equal(init.headers.get("x-mock-user-email"), "user@company.com");
      return new Response(
        JSON.stringify(
          success({
            id: "reg_leave",
            appId: "app_leave",
            projectId: "prj_leave",
            slug: "leave-management",
            name: "Leave Management",
            ownerName: "Creator User",
            accessStatus: "active",
            myRole: "Employee",
            health: "healthy",
            version: "manifest v1",
            actions: ["open", "submit_ticket"]
          })
        ),
        { status: 200 }
      );
    }
  });

  const detail = await client.getStoreAppDetail("leave-management");

  assert.equal(detail.slug, "leave-management");
  assert.equal(detail.myRole, "Employee");
});

test("platform API client requests App Store access", async () => {
  let observedBody = {};
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "user@company.com",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://platform.example/api/store/apps/leave-management/access-requests");
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            id: "areq_0001",
            appSlug: "leave-management",
            requestedRoleKey: "manager",
            requesterEmail: "user@company.com",
            status: "pending",
            reason: "Need approval access",
            department: "HR",
            createdAt: "2026-07-04T01:00:00.000Z"
          })
        ),
        { status: 201 }
      );
    }
  });

  const request = await client.requestStoreAccess("leave-management", {
    requestedRoleKey: "manager",
    reason: "Need approval access",
    department: "HR"
  });

  assert.equal(observedBody.requestedRoleKey, "manager");
  assert.equal(request.status, "pending");
  assert.equal(request.requesterEmail, "user@company.com");
});

test("platform API client submits App Store tickets and reads ticket status", async () => {
  const seenUrls = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    sessionToken: "evcp_session.payload.signature",
    fetcher: async (url, init) => {
      seenUrls.push(String(url));
      assert.equal(init.headers.get("authorization"), "Bearer evcp_session.payload.signature");
      if (String(url).endsWith("/tickets")) {
        const body = JSON.parse(String(init.body));
        assert.equal(body.title, "WFH leave type missing");
        return new Response(
          JSON.stringify(
            success({
              id: "ticket_0001",
              ticketNumber: "TKT-0001",
              appSlug: "leave-management",
              type: "bug",
              priority: "high",
              title: "WFH leave type missing",
              description: "The WFH option is not visible on mobile.",
              deviceInfo: "iPhone Safari",
              status: "submitted",
              timeline: [{ id: "tl_001", status: "submitted", label: "Ticket submitted" }]
            })
          ),
          { status: 201 }
        );
      }
      return new Response(
        JSON.stringify(
          success({
            id: "ticket_0001",
            ticketNumber: "TKT-0001",
            appSlug: "leave-management",
            appName: "Leave Management",
            status: "submitted",
            timeline: [{ id: "tl_001", status: "submitted", label: "Ticket submitted" }]
          })
        ),
        { status: 200 }
      );
    }
  });

  const ticket = await client.submitStoreTicket("leave-management", {
    type: "bug",
    priority: "high",
    title: "WFH leave type missing",
    description: "The WFH option is not visible on mobile.",
    deviceInfo: "iPhone Safari"
  });
  const status = await client.getStoreTicket(ticket.id);

  assert.deepEqual(seenUrls, [
    "https://platform.example/api/store/apps/leave-management/tickets",
    "https://platform.example/api/store/tickets/ticket_0001"
  ]);
  assert.equal(status.ticketNumber, "TKT-0001");
  assert.equal(status.timeline[0].status, "submitted");
});

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
            preview: { id: "preview_0001", version: "preview-0001", summary: "Mock preview updated: Add WFH leave type", highlights: [] },
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
              steps: [{ id: "wst_0001_step_1", label: "Understanding request", status: "done", order: 1 }]
            },
            preview: { id: "preview_0001", version: "preview-0001", summary: "Mock preview updated: Add WFH leave type", highlights: [] },
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
      assert.equal(String(url), "https://platform.example/api/projects/proj_001/workspace/preview/refresh");
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
