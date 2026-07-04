import "reflect-metadata";
import { HttpStatus } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { failure, success } from "@evcp/api-client";
import type { ApiResult } from "@evcp/api-client";
import { PlatformApiModule } from "./platform-api.module";
import { createPlatformApiServices, type PlatformApiServices } from "./platform-services";

type HeaderBag = Record<string, string | string[] | undefined>;

type HttpRequest = {
  headers: HeaderBag;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
};

type HttpResponse = {
  status: (code: number) => HttpResponse;
  json: (body: unknown) => void;
};

type RouteRegistry = {
  get: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void) => void;
  post: (path: string, handler: (request: HttpRequest, response: HttpResponse) => void) => void;
};

export interface PlatformRequest {
  method: "GET" | "POST";
  path:
    | "/health"
    | "/auth/me"
    | "/projects"
    | "/audit-logs"
    | "/ai/providers"
    | "/ai/api-keys"
    | "/ai/routes"
    | "/ai/quotas"
    | "/guardrails/rules"
    | "/guardrails/test"
    | "/guardrails/events"
    | `/projects/${string}/prd`
    | `/projects/${string}/prd/generate`
    | `/projects/${string}/prd/baseline`
    | `/projects/${string}/prd/versions`
    | `/projects/${string}/workspace`
    | `/projects/${string}/workspace/prompts`
    | `/projects/${string}/workspace/preview/refresh`;
  headers?: HeaderBag;
  body?: Record<string, unknown>;
}

export interface PlatformResponse<T = unknown> {
  status: number;
  body: ApiResult<T>;
}

function errorResponse(error: unknown): PlatformResponse {
  if (error instanceof Error && error.name === "MockAuthError") {
    return { status: HttpStatus.UNAUTHORIZED, body: failure("UNAUTHORIZED", error.message) };
  }

  if (error instanceof Error && error.name === "PermissionError") {
    return { status: HttpStatus.FORBIDDEN, body: failure("FORBIDDEN", error.message) };
  }

  if (error instanceof Error && error.name === "ValidationError") {
    return { status: HttpStatus.UNPROCESSABLE_ENTITY, body: failure("VALIDATION_ERROR", error.message) };
  }

  if (error instanceof Error && error.name === "ConflictError") {
    return { status: HttpStatus.CONFLICT, body: failure("CONFLICT", error.message) };
  }

  if (error instanceof Error && error.name === "QuotaExceededError") {
    return { status: HttpStatus.TOO_MANY_REQUESTS, body: failure("QUOTA_EXCEEDED", error.message) };
  }

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: failure("INTERNAL_ERROR", "Unexpected platform API error") };
}

function sendPlatformResponse(response: HttpResponse, platformResponse: PlatformResponse): void {
  response.status(platformResponse.status).json(platformResponse.body);
}

export function executePlatformApiRequest(services: PlatformApiServices, request: PlatformRequest): PlatformResponse {
  try {
    if (request.method === "GET" && request.path === "/health") {
      return {
        status: HttpStatus.OK,
        body: success({
          service: "platform-api",
          status: "healthy",
          dependencies: {
            database: "configured",
            authMode: "mock"
          }
        })
      };
    }

    if (request.method === "GET" && request.path === "/auth/me") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});

      services.audit.record({
        actorId: user.id,
        action: "auth.me",
        resourceType: "platform_user",
        resourceId: user.id
      });

      return {
        status: HttpStatus.OK,
        body: success({
          user,
          permissions: user.permissions
        })
      };
    }

    if (request.method === "GET" && request.path === "/projects") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin", "creator"]);
      return { status: HttpStatus.OK, body: success(services.projects.listProjects(user)) };
    }

    if (request.method === "POST" && request.path === "/projects") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const project = services.projects.createProject({
        actor: user,
        name: String(request.body?.name ?? "Untitled Project"),
        slug: String(request.body?.slug ?? "untitled-project"),
        appType: request.body?.appType ? String(request.body.appType) : undefined,
        businessProblem: request.body?.businessProblem ? String(request.body.businessProblem) : undefined,
        targetDepartment: request.body?.targetDepartment ? String(request.body.targetDepartment) : undefined,
        intendedUsers: Array.isArray(request.body?.intendedUsers) ? request.body.intendedUsers.map(String) : undefined,
        dataSensitivity: request.body?.dataSensitivity ? (String(request.body.dataSensitivity) as never) : undefined
      });

      return { status: HttpStatus.CREATED, body: success(project) };
    }

    const prdGenerateMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/generate$/);
    if (request.method === "POST" && prdGenerateMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const draft = services.prds.generateDraft(user, prdGenerateMatch[1]);
      return { status: HttpStatus.CREATED, body: success(draft) };
    }

    const prdBaselineMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/baseline$/);
    if (request.method === "POST" && prdBaselineMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const baseline = services.prds.confirmBaseline(user, prdBaselineMatch[1], String(request.body?.versionId ?? ""));
      return { status: HttpStatus.OK, body: success(baseline) };
    }

    const prdVersionsMatch = request.path.match(/^\/projects\/([^/]+)\/prd\/versions$/);
    if (request.method === "GET" && prdVersionsMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.prds.listVersions(user, prdVersionsMatch[1])) };
    }

    const prdCurrentMatch = request.path.match(/^\/projects\/([^/]+)\/prd$/);
    if (request.method === "GET" && prdCurrentMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.prds.getCurrent(user, prdCurrentMatch[1])) };
    }

    const workspacePromptMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/prompts$/);
    if (request.method === "POST" && workspacePromptMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.workspace.submitPrompt(user, workspacePromptMatch[1], {
        prompt: String(request.body?.prompt ?? "")
      });
      return {
        status: result.guardrail.decision === "block" ? HttpStatus.OK : HttpStatus.CREATED,
        body: success(result)
      };
    }

    const workspaceRefreshMatch = request.path.match(/^\/projects\/([^/]+)\/workspace\/preview\/refresh$/);
    if (request.method === "POST" && workspaceRefreshMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.workspace.refreshPreview(user, workspaceRefreshMatch[1])) };
    }

    const workspaceMatch = request.path.match(/^\/projects\/([^/]+)\/workspace$/);
    if (request.method === "GET" && workspaceMatch) {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      return { status: HttpStatus.OK, body: success(services.workspace.getWorkspace(user, workspaceMatch[1])) };
    }

    if (request.method === "GET" && request.path === "/audit-logs") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.audit.list()) };
    }

    if (request.method === "GET" && request.path === "/ai/providers") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.aiGovernance.listProviders()) };
    }

    if (request.method === "POST" && request.path === "/ai/providers") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const provider = services.aiGovernance.createProvider(user, {
        name: String(request.body?.name ?? ""),
        adapter: String(request.body?.adapter ?? "mock") as never,
        baseUrl: String(request.body?.baseUrl ?? ""),
        models: Array.isArray(request.body?.models) ? request.body.models.map(String) : []
      });
      return { status: HttpStatus.CREATED, body: success(provider) };
    }

    if (request.method === "GET" && request.path === "/ai/api-keys") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.aiGovernance.listApiKeys()) };
    }

    if (request.method === "POST" && request.path === "/ai/api-keys") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const key = services.aiGovernance.createApiKey(user, {
        providerId: String(request.body?.providerId ?? ""),
        name: String(request.body?.name ?? ""),
        secret: String(request.body?.secret ?? ""),
        usageMode: String(request.body?.usageMode ?? "production") as never,
        quotaTokens: Number(request.body?.quotaTokens ?? 0),
        fallbackPriority: Number(request.body?.fallbackPriority ?? 0)
      });
      return { status: HttpStatus.CREATED, body: success(key) };
    }

    if (request.method === "POST" && request.path === "/ai/routes") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const route = services.aiGovernance.configureRoute(user, {
        scenario: String(request.body?.scenario ?? "prd_generation") as never,
        primaryProviderId: String(request.body?.primaryProviderId ?? ""),
        primaryModel: String(request.body?.primaryModel ?? ""),
        fallbackProviderId: request.body?.fallbackProviderId ? String(request.body.fallbackProviderId) : undefined,
        fallbackModel: request.body?.fallbackModel ? String(request.body.fallbackModel) : undefined
      });
      return { status: HttpStatus.OK, body: success(route) };
    }

    if (request.method === "POST" && request.path === "/ai/quotas") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const quota = services.aiGovernance.configureQuota(user, {
        scope: String(request.body?.scope ?? "organization") as never,
        dailyLimit: Number(request.body?.dailyLimit ?? 0),
        monthlyLimit: Number(request.body?.monthlyLimit ?? 0),
        warningThreshold: Number(request.body?.warningThreshold ?? 0),
        hardStop: Boolean(request.body?.hardStop ?? true),
        usedToday: Number(request.body?.usedToday ?? 0)
      });
      return { status: HttpStatus.OK, body: success(quota) };
    }

    if (request.method === "POST" && request.path === "/guardrails/rules") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const rule = services.guardrails.createRule(user, {
        name: String(request.body?.name ?? ""),
        type: String(request.body?.type ?? "keyword") as never,
        pattern: String(request.body?.pattern ?? ""),
        severity: String(request.body?.severity ?? "warning") as never,
        action: String(request.body?.action ?? "warn") as never,
        scope: String(request.body?.scope ?? "organization") as never
      });
      return { status: HttpStatus.CREATED, body: success(rule) };
    }

    if (request.method === "POST" && request.path === "/guardrails/test") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const result = services.guardrails.testPrompt(user, {
        prompt: String(request.body?.prompt ?? ""),
        scenario: String(request.body?.scenario ?? "prd_generation")
      });
      return { status: HttpStatus.OK, body: success(result) };
    }

    if (request.method === "GET" && request.path === "/guardrails/events") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.guardrails.listEvents()) };
    }

    return { status: HttpStatus.NOT_FOUND, body: failure("NOT_FOUND", "Unknown platform API route") };
  } catch (error) {
    return errorResponse(error);
  }
}

function registerPlatformRoutes(app: INestApplication, services: PlatformApiServices): void {
  const routes = app.getHttpAdapter().getInstance() as RouteRegistry;

  routes.get("/health", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/health", headers: request.headers }))
  );
  routes.get("/auth/me", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/auth/me", headers: request.headers }))
  );
  routes.get("/projects", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/projects", headers: request.headers }))
  );
  routes.post("/projects", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/projects", headers: request.headers, body: request.body })
    )
  );
  routes.get("/audit-logs", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/audit-logs", headers: request.headers }))
  );
  routes.post("/projects/:projectId/prd/generate", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/generate`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/prd/baseline", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/baseline`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/projects/:projectId/prd/versions", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd/versions`,
        headers: request.headers
      })
    )
  );
  routes.get("/projects/:projectId/prd", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/prd`,
        headers: request.headers
      })
    )
  );
  routes.get("/projects/:projectId/workspace", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "GET",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace`,
        headers: request.headers
      })
    )
  );
  routes.post("/projects/:projectId/workspace/prompts", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/prompts`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.post("/projects/:projectId/workspace/preview/refresh", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, {
        method: "POST",
        path: `/projects/${String(request.params?.projectId ?? "")}/workspace/preview/refresh`,
        headers: request.headers,
        body: request.body
      })
    )
  );
  routes.get("/ai/providers", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/ai/providers", headers: request.headers }))
  );
  routes.post("/ai/providers", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/providers", headers: request.headers, body: request.body })
    )
  );
  routes.get("/ai/api-keys", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/ai/api-keys", headers: request.headers }))
  );
  routes.post("/ai/api-keys", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/api-keys", headers: request.headers, body: request.body })
    )
  );
  routes.post("/ai/routes", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/routes", headers: request.headers, body: request.body })
    )
  );
  routes.post("/ai/quotas", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/ai/quotas", headers: request.headers, body: request.body })
    )
  );
  routes.post("/guardrails/rules", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/guardrails/rules", headers: request.headers, body: request.body })
    )
  );
  routes.post("/guardrails/test", (request, response) =>
    sendPlatformResponse(
      response,
      executePlatformApiRequest(services, { method: "POST", path: "/guardrails/test", headers: request.headers, body: request.body })
    )
  );
  routes.get("/guardrails/events", (request, response) =>
    sendPlatformResponse(response, executePlatformApiRequest(services, { method: "GET", path: "/guardrails/events", headers: request.headers }))
  );
}

export async function createPlatformApiApp(services: PlatformApiServices = createPlatformApiServices()): Promise<INestApplication> {
  const app = await NestFactory.create(PlatformApiModule, {
    logger: false
  });

  app.enableCors({
    origin: true,
    credentials: true
  });
  registerPlatformRoutes(app, services);

  return app;
}
