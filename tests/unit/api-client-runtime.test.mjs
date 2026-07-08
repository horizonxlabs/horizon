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

test("platform API client binds the default browser fetch implementation", async () => {
  const originalFetch = globalThis.fetch;
  let observedThis;
  globalThis.fetch = async function (_url, init) {
    observedThis = this;
    assert.equal(init.headers.get("x-mock-user-email"), "admin@company.com");
    return new Response(
      JSON.stringify(
        success({
          user: { id: "usr_admin", name: "Admin User", email: "admin@company.com", role: "admin" },
          permissions: ["platform:admin"],
          auth: { mode: "mock_header", legacyMockFallback: true }
        })
      ),
      { status: 200 }
    );
  };
  try {
    const client = createPlatformApiClient({
      baseUrl: "https://platform.example/api",
      legacyUserEmail: "admin@company.com"
    });
    const currentUser = await client.getCurrentUser();

    assert.equal(observedThis, globalThis);
    assert.equal(currentUser.user.email, "admin@company.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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

test("platform API client creates projects and generates PRD drafts", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      observed.push({ url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url) === "https://platform.example/api/projects") {
        return new Response(JSON.stringify(success({
          id: "prj_expense_approval",
          slug: "expense-approval",
          name: "Expense Approval",
          status: "draft",
          ownerUserId: "usr_creator",
          appType: "Workflow App",
          businessProblem: "Reduce manual approvals",
          targetDepartment: "Finance",
          intendedUsers: ["Employee", "Manager"],
          dataSensitivity: "internal",
          createdAt: "2026-07-05T00:00:00.000Z"
        })), { status: 201 });
      }
      if (String(url) === "https://platform.example/api/projects/prj_expense_approval/prd/generate") {
        return new Response(JSON.stringify(success({
          id: "prdver_prj_expense_approval_01",
          projectId: "prj_expense_approval",
          version: "0.1",
          status: "draft",
          changeSummary: "Generated initial PRD draft for Expense Approval",
          sections: [{ key: "overview", title: "Overview", body: "Draft", order: 1 }]
        })), { status: 201 });
      }
      throw new Error(`Unexpected request ${url}`);
    }
  });

  const project = await client.createProject({
    name: "Expense Approval",
    slug: "expense-approval",
    appType: "Workflow App",
    businessProblem: "Reduce manual approvals",
    targetDepartment: "Finance",
    intendedUsers: ["Employee", "Manager"],
    dataSensitivity: "internal"
  });
  const draft = await client.generatePrdDraft(project.id);

  assert.equal(observed[0].method, "POST");
  assert.equal(observed[0].body.slug, "expense-approval");
  assert.equal(observed[1].method, "POST");
  assert.equal(draft.sections[0].title, "Overview");
});

test("platform API client installs and uninstalls App Store apps", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "user@company.com",
    fetcher: async (url, init) => {
      observed.push({ url: String(url), method: init.method ?? "GET", user: init.headers.get("x-mock-user-email") });
      if (String(url).endsWith("/store/apps/leave-management/install")) {
        return new Response(JSON.stringify(success({ id: "appinst_001", appSlug: "leave-management", status: "active", installedAt: "2026-07-04T04:20:00.000Z" })), { status: 201 });
      }
      if (String(url).endsWith("/store/apps/leave-management/uninstall")) {
        return new Response(JSON.stringify(success({ id: "appinst_001", appSlug: "leave-management", status: "disabled", installedAt: "2026-07-04T04:20:00.000Z", disabledAt: "2026-07-04T04:25:00.000Z" })), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    }
  });

  const installed = await client.installStoreApp("leave-management");
  const uninstalled = await client.uninstallStoreApp("leave-management");

  assert.equal(installed.status, "active");
  assert.equal(uninstalled.status, "disabled");
  assert.deepEqual(
    observed.map((request) => `${request.method} ${new URL(request.url).pathname} ${request.user}`),
    [
      "POST /api/store/apps/leave-management/install user@company.com",
      "POST /api/store/apps/leave-management/uninstall user@company.com"
    ]
  );
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

test("platform API client posts AI provider test-call requests", async () => {
  let observedUrl = "";
  let observedBody = {};
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      observedUrl = String(url);
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            providerId: "aip_openai",
            providerName: "OpenAI Production",
            adapter: "openai",
            model: "gpt-4.1-mini",
            status: "succeeded",
            fallbackUsed: false,
            tokensUsed: 42,
            latencyMs: 7,
            usageLogId: "aigw_0001",
            outputExcerpt: "Provider route is ready"
          })
        ),
        { status: 201 }
      );
    }
  });

  const result = await client.testAiProvider({
    scenario: "prd_generation",
    prompt: "Validate provider route",
    dryRun: true
  });

  assert.equal(observedUrl, "https://platform.example/api/ai/provider-test-call");
  assert.deepEqual(observedBody, { scenario: "prd_generation", prompt: "Validate provider route", dryRun: true });
  assert.equal(result.providerName, "OpenAI Production");
  assert.equal(result.usageLogId, "aigw_0001");
});

test("platform API client manages AI governance resources", async () => {
  const observed = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "admin@company.com",
    fetcher: async (url, init) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      observed.push({ url: String(url), method, body });

      if (method === "GET" && String(url).endsWith("/ai/providers")) {
        return new Response(JSON.stringify(success([{ id: "aip_openai", name: "OpenAI Production", adapter: "openai", models: ["gpt-4.1"], status: "active" }])), { status: 200 });
      }
      if (method === "GET" && String(url).endsWith("/ai/api-keys")) {
        return new Response(JSON.stringify(success([{ id: "aik_openai", providerId: "aip_openai", name: "Primary", maskedValue: "sk-...1234", fingerprint: "sha256:abc", status: "active" }])), { status: 200 });
      }
      if (method === "POST" && String(url).endsWith("/ai/providers")) {
        return new Response(JSON.stringify(success({ id: "aip_new", name: body.name, adapter: body.adapter, baseUrl: body.baseUrl, models: body.models, status: "active" })), { status: 201 });
      }
      if (method === "POST" && String(url).endsWith("/ai/api-keys")) {
        return new Response(JSON.stringify(success({ id: "aik_new", providerId: body.providerId, name: body.name, maskedValue: "sk-...7890", fingerprint: "sha256:def", status: "active" })), { status: 201 });
      }
      if (method === "POST" && String(url).endsWith("/ai/routes")) {
        return new Response(JSON.stringify(success({ scenario: body.scenario, primary: { providerId: body.primaryProviderId, model: body.primaryModel } })), { status: 200 });
      }
      if (method === "POST" && String(url).endsWith("/ai/quotas")) {
        return new Response(JSON.stringify(success(body)), { status: 200 });
      }
      if (method === "POST" && String(url).endsWith("/guardrails/rules")) {
        return new Response(JSON.stringify(success({ id: "grd_new", ...body, status: "active" })), { status: 201 });
      }
      if (method === "GET" && String(url).endsWith("/guardrails/events")) {
        return new Response(JSON.stringify(success([{ id: "gre_0001", decision: "block", prompt: "redacted", scenario: "prd_generation" }])), { status: 200 });
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    }
  });

  const providers = await client.listAiProviders();
  const keys = await client.listAiApiKeys();
  const provider = await client.createAiProvider({ name: "OpenAI New", adapter: "openai", baseUrl: "https://api.openai.com/v1", models: ["gpt-4.1-mini"] });
  const key = await client.createAiApiKey({ providerId: provider.id, name: "Primary", secret: "secret-value", usageMode: "production", quotaTokens: 1000, fallbackPriority: 1 });
  const route = await client.configureAiRoute({ scenario: "prd_generation", primaryProviderId: provider.id, primaryModel: "gpt-4.1-mini" });
  const quota = await client.configureAiQuota({ scope: "creator", dailyLimit: 1000, monthlyLimit: 30000, warningThreshold: 900, hardStop: true, usedToday: 0 });
  const rule = await client.createGuardrailRule({ name: "Block payroll export", type: "keyword", pattern: "payroll", severity: "high", action: "block", scope: "organization" });
  const events = await client.listGuardrailEvents();

  assert.equal(providers[0].id, "aip_openai");
  assert.equal(keys[0].maskedValue, "sk-...1234");
  assert.equal(key.fingerprint, "sha256:def");
  assert.equal(route.primary.model, "gpt-4.1-mini");
  assert.equal(quota.scope, "creator");
  assert.equal(rule.status, "active");
  assert.equal(events[0].id, "gre_0001");
  assert.deepEqual(
    observed.map((request) => `${request.method} ${new URL(request.url).pathname}`),
    [
      "GET /api/ai/providers",
      "GET /api/ai/api-keys",
      "POST /api/ai/providers",
      "POST /api/ai/api-keys",
      "POST /api/ai/routes",
      "POST /api/ai/quotas",
      "POST /api/guardrails/rules",
      "GET /api/guardrails/events"
    ]
  );
  assert.equal(observed[3].body.secret, "secret-value");
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
            app: { id: "app_leave", projectId: "proj_001", slug: "leave-management", name: "Leave Management", status: "draft", route: "/apps/leave-management" },
            roles: [{ id: "role_employee", appId: "app_leave", key: "employee", name: "Employee", description: "Request leave", permissions: ["leave:request"], memberCount: 1 }],
            members: [{ id: "mem_001", appId: "app_leave", email: "user@company.com", name: "End User", userType: "internal", roleKey: "employee", roleName: "Employee", status: "active" }],
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
      assert.equal(String(url), "https://platform.example/api/projects/proj_001/app/access-requests/decision");
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
              manifest: { appId: "app_leave", manifestVersion: "1", app: { slug: "leave-management", route: "/apps/leave-management" }, roles: [] },
              checklist: [{ key: "prd", label: "PRD baseline", status: "pass", detail: "Baseline v1.0" }]
            })
          ),
          { status: 200 }
        );
      }
      if (String(url).endsWith("/publish")) {
        return new Response(
          JSON.stringify(
            success({
              publishRequest: { id: "pubreq_0001", status: "published", blockingItems: [], manifestVersion: "1" },
              deployment: { id: "dep_0001", status: "published", route: "/apps/leave-management" },
              registryEntry: { id: "store_leave", slug: "leave-management", status: "published", route: "/apps/leave-management" },
              manifest: { appId: "app_leave", manifestVersion: "1" }
            })
          ),
          { status: 201 }
        );
      }
      return new Response(
        JSON.stringify(success([{ id: "store_leave", slug: "leave-management", status: "published" }])),
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
