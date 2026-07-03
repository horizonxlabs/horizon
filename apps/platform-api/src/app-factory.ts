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
  path: "/health" | "/auth/me" | "/projects" | "/audit-logs";
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
      return { status: HttpStatus.OK, body: success(services.projects.listProjects()) };
    }

    if (request.method === "POST" && request.path === "/projects") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      const project = services.projects.createProject({
        actor: user,
        name: String(request.body?.name ?? "Untitled Project"),
        slug: String(request.body?.slug ?? "untitled-project")
      });

      return { status: HttpStatus.CREATED, body: success(project) };
    }

    if (request.method === "GET" && request.path === "/audit-logs") {
      const user = services.auth.resolveCurrentUser(request.headers ?? {});
      services.auth.requireRole(user, ["admin"]);
      return { status: HttpStatus.OK, body: success(services.audit.list()) };
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
