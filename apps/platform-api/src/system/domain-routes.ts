import { HttpStatus } from "@nestjs/common";
import { failure, success } from "@evcp/api-client";
import type { PlatformRequest, PlatformResponse } from "../platform-http-types";
import type { MockAuthService, PlatformUser } from "../platform-services";
import { errorResponse } from "../error-response";
import { InvalidDomain, type DomainService } from "./domain-service";

// Minimal structural types mirroring the HTTP registrar in app-factory (mirrors system-routes.ts).
type DomainHttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};
type DomainHttpResponse = {
  status: (code: number) => DomainHttpResponse;
  json: (body: unknown) => void;
};
type DomainRouteRegistry = {
  get: (path: string, handler: (req: DomainHttpRequest, res: DomainHttpResponse) => void) => void;
  post: (path: string, handler: (req: DomainHttpRequest, res: DomainHttpResponse) => void) => void;
};

/**
 * Resolves the admin domain go-live routes. Dispatched directly by `registerDomainRoutes`
 * (mirrors `resolveSystemRequest`) — `InvalidDomain` maps to 400, everything else through the
 * shared `errorResponse` mapper (role failures included).
 */
export async function resolveDomainRequest(
  request: PlatformRequest,
  deps: {
    domainService: DomainService;
    auth: Pick<MockAuthService, "requireRole">;
    resolveActor: () => Promise<PlatformUser>;
  }
): Promise<PlatformResponse> {
  try {
    const actor = await deps.resolveActor();
    deps.auth.requireRole(actor, ["admin"]);

    if (request.method === "GET" && request.path === "/admin/system/domain") {
      const status = await deps.domainService.getDomainStatus();
      return { status: HttpStatus.OK, body: success(status) };
    }

    if (request.method === "POST" && request.path === "/admin/system/domain") {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const domain = String(body.domain ?? "");
      const result = await deps.domainService.setDomain(domain);
      return { status: HttpStatus.ACCEPTED, body: success(result) };
    }

    return { status: HttpStatus.NOT_FOUND, body: failure("NOT_FOUND", "Unknown platform API route") };
  } catch (error) {
    if (error instanceof InvalidDomain) {
      return { status: HttpStatus.BAD_REQUEST, body: failure("invalid_domain", error.message) };
    }
    return errorResponse(error);
  }
}

/**
 * Registers the HTTP surface for the admin domain go-live routes (mirrors `registerSystemRoutes`).
 */
export function registerDomainRoutes(
  routes: DomainRouteRegistry,
  dispatch: (response: DomainHttpResponse, request: PlatformRequest) => void
): void {
  routes.get("/admin/system/domain", (request, response) =>
    dispatch(response, { method: "GET", path: "/admin/system/domain", headers: request.headers })
  );
  routes.post("/admin/system/domain", (request, response) =>
    dispatch(response, {
      method: "POST",
      path: "/admin/system/domain",
      headers: request.headers,
      body: request.body
    })
  );
}
