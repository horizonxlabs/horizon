import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, createPlatformSessionStore, PlatformApiError, success, failure } =
  await import("../../packages/api-client/src/index.ts");

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
            user: {
              id: "usr_admin",
              name: "Admin User",
              email: "admin@company.com",
              role: "admin"
            },
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
      return new Response(JSON.stringify(success([{ id: "proj_001", name: "Leave Management" }])), {
        status: 200
      });
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
      observed.push({
        url: String(url),
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined
      });
      if (String(url) === "https://platform.example/api/projects") {
        return new Response(
          JSON.stringify(
            success({
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
            })
          ),
          { status: 201 }
        );
      }
      if (
        String(url) === "https://platform.example/api/projects/prj_expense_approval/prd/generate"
      ) {
        return new Response(
          JSON.stringify(
            success({
              id: "prdver_prj_expense_approval_01",
              projectId: "prj_expense_approval",
              version: "0.1",
              status: "draft",
              changeSummary: "Generated initial PRD draft for Expense Approval",
              sections: [{ key: "overview", title: "Overview", body: "Draft", order: 1 }]
            })
          ),
          { status: 201 }
        );
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
      observed.push({
        url: String(url),
        method: init.method ?? "GET",
        user: init.headers.get("x-mock-user-email")
      });
      if (String(url).endsWith("/store/apps/leave-management/install")) {
        return new Response(
          JSON.stringify(
            success({
              id: "appinst_001",
              appSlug: "leave-management",
              status: "active",
              installedAt: "2026-07-04T04:20:00.000Z"
            })
          ),
          { status: 201 }
        );
      }
      if (String(url).endsWith("/store/apps/leave-management/uninstall")) {
        return new Response(
          JSON.stringify(
            success({
              id: "appinst_001",
              appSlug: "leave-management",
              status: "disabled",
              installedAt: "2026-07-04T04:20:00.000Z",
              disabledAt: "2026-07-04T04:25:00.000Z"
            })
          ),
          { status: 200 }
        );
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

test("platform API client builds Keycloak login and logout redirects without a browser token", async () => {
  const { startKeycloakLogin, startKeycloakLogout } =
    await import("../../packages/api-client/src/index.ts");
  assert.equal(
    startKeycloakLogin(
      "https://platform.example/api",
      "creator",
      "https://creator.example/workspace"
    ),
    "https://platform.example/api/auth/keycloak/start?app=creator&returnTo=https%3A%2F%2Fcreator.example%2Fworkspace"
  );
  assert.equal(
    startKeycloakLogout(
      "https://platform.example/api",
      "creator",
      "https://creator.example/workspace"
    ),
    "https://platform.example/api/auth/keycloak/logout?app=creator&returnTo=https%3A%2F%2Fcreator.example%2Fworkspace"
  );
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
  assert.deepEqual(observedBody, {
    scenario: "prd_generation",
    prompt: "Validate provider route",
    dryRun: true
  });
  assert.equal(result.providerName, "OpenAI Production");
  assert.equal(result.usageLogId, "aigw_0001");
});

test("platform API client queues and reads durable AI jobs", async () => {
  const calls = [];
  const client = createPlatformApiClient({
    baseUrl: "http://platform.test/api",
    fetcher: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET", body: init.body });
      return new Response(
        JSON.stringify(
          success({
            id: "aijob_1",
            requestId: "req_1",
            scenario: "frontend_coding",
            status: "queued",
            attempts: 0,
            createdAt: "2026-07-14T00:00:00.000Z",
            updatedAt: "2026-07-14T00:00:00.000Z"
          })
        ),
        { status: 200 }
      );
    }
  });
  await client.enqueueDurableAiJob("project one", {
    prompt: "Build a review",
    scenario: "frontend_coding",
    requestId: "req_1"
  });
  await client.getDurableAiJob("project one", "aijob_1");
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.url}`),
    [
      "POST http://platform.test/api/projects/project%20one/ai-jobs",
      "GET http://platform.test/api/projects/project%20one/ai-jobs/aijob_1"
    ]
  );
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
        return new Response(
          JSON.stringify(
            success([
              {
                id: "aip_openai",
                name: "OpenAI Production",
                adapter: "openai",
                models: ["gpt-4.1"],
                status: "active"
              }
            ])
          ),
          { status: 200 }
        );
      }
      if (method === "GET" && String(url).endsWith("/ai/api-keys")) {
        return new Response(
          JSON.stringify(
            success([
              {
                id: "aik_openai",
                providerId: "aip_openai",
                name: "Primary",
                maskedValue: "sk-...1234",
                fingerprint: "sha256:abc",
                status: "active"
              }
            ])
          ),
          { status: 200 }
        );
      }
      if (method === "POST" && String(url).endsWith("/ai/providers")) {
        return new Response(
          JSON.stringify(
            success({
              id: "aip_new",
              name: body.name,
              adapter: body.adapter,
              baseUrl: body.baseUrl,
              models: body.models,
              status: "active"
            })
          ),
          { status: 201 }
        );
      }
      if (method === "POST" && String(url).endsWith("/ai/api-keys")) {
        return new Response(
          JSON.stringify(
            success({
              id: "aik_new",
              providerId: body.providerId,
              name: body.name,
              maskedValue: "sk-...7890",
              fingerprint: "sha256:def",
              status: "active"
            })
          ),
          { status: 201 }
        );
      }
      if (method === "POST" && String(url).endsWith("/ai/routes")) {
        return new Response(
          JSON.stringify(
            success({
              scenario: body.scenario,
              primary: { providerId: body.primaryProviderId, model: body.primaryModel }
            })
          ),
          { status: 200 }
        );
      }
      if (method === "POST" && String(url).endsWith("/ai/quotas")) {
        return new Response(JSON.stringify(success(body)), { status: 200 });
      }
      if (method === "POST" && String(url).endsWith("/guardrails/rules")) {
        return new Response(JSON.stringify(success({ id: "grd_new", ...body, status: "active" })), {
          status: 201
        });
      }
      if (method === "GET" && String(url).endsWith("/guardrails/events")) {
        return new Response(
          JSON.stringify(
            success([
              { id: "gre_0001", decision: "block", prompt: "redacted", scenario: "prd_generation" }
            ])
          ),
          { status: 200 }
        );
      }
      throw new Error(`Unexpected request ${method} ${url}`);
    }
  });

  const providers = await client.listAiProviders();
  const keys = await client.listAiApiKeys();
  const provider = await client.createAiProvider({
    name: "OpenAI New",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1-mini"]
  });
  const key = await client.createAiApiKey({
    providerId: provider.id,
    name: "Primary",
    secret: "secret-value",
    usageMode: "production",
    quotaTokens: 1000,
    fallbackPriority: 1
  });
  const route = await client.configureAiRoute({
    scenario: "prd_generation",
    primaryProviderId: provider.id,
    primaryModel: "gpt-4.1-mini"
  });
  const quota = await client.configureAiQuota({
    scope: "creator",
    dailyLimit: 1000,
    monthlyLimit: 30000,
    warningThreshold: 900,
    hardStop: true,
    usedToday: 0
  });
  const rule = await client.createGuardrailRule({
    name: "Block payroll export",
    type: "keyword",
    pattern: "payroll",
    severity: "high",
    action: "block",
    scope: "organization"
  });
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
    storage: {
      provider: "minio",
      endpoint: "http://minio:9000",
      bucket: "evcp-artifacts",
      secretAccessKey: "secret"
    },
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
      return new Response(
        JSON.stringify(success([{ id: "instrep_0001", status: "passed", installBlocked: false }])),
        { status: 200 }
      );
    }
  });

  const reports = await client.listInstallerReports();

  assert.equal(reports.length, 1);
  assert.equal(reports[0].status, "passed");
});
