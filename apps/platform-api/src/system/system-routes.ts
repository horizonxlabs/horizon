import { HttpStatus } from "@nestjs/common";
import { failure, success } from "@evcp/api-client";
import type { PlatformRequest, PlatformResponse } from "../platform-http-types";
import type { MockAuthService, PlatformUser } from "../platform-services";
import { errorResponse } from "../error-response";
import { InvalidVersionTag, type SystemUpdateService } from "./system-update-service";

// Minimal structural types mirroring the HTTP registrar in app-factory. Kept local so this
// focused module can register its own routes without widening app-factory's exported surface
// (mirrors setup-routes.ts).
type SystemHttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};
type SystemHttpResponse = {
  status: (code: number) => SystemHttpResponse;
  json: (body: unknown) => void;
};
type SystemRouteRegistry = {
  get: (path: string, handler: (req: SystemHttpRequest, res: SystemHttpResponse) => void) => void;
  post: (path: string, handler: (req: SystemHttpRequest, res: SystemHttpResponse) => void) => void;
};

/**
 * Resolves the admin system-version + system-update routes. Unlike `resolveSetupRequest`, these
 * routes are dispatched directly by `registerSystemRoutes` (not folded into the shared
 * `executePlatformApiRequestAsync` switch), so this always returns a response for the two paths
 * it owns and maps its own errors — `InvalidVersionTag` to 400, everything else through the
 * shared `errorResponse` mapper (role failures included).
 */
export async function resolveSystemRequest(
  request: PlatformRequest,
  deps: {
    systemUpdateService: SystemUpdateService;
    auth: Pick<MockAuthService, "requireRole">;
    resolveActor: () => Promise<PlatformUser>;
  }
): Promise<PlatformResponse> {
  try {
    const actor = await deps.resolveActor();
    deps.auth.requireRole(actor, ["admin"]);

    if (request.method === "GET" && request.path === "/admin/system/version") {
      const version = await deps.systemUpdateService.getSystemVersion();
      return { status: HttpStatus.OK, body: success(version) };
    }

    if (request.method === "POST" && request.path === "/admin/system/update") {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const targetVersion = String(body.version ?? body.targetVersion ?? "");
      const result = await deps.systemUpdateService.updateToVersion(targetVersion);
      return { status: HttpStatus.ACCEPTED, body: success(result) };
    }

    return { status: HttpStatus.NOT_FOUND, body: failure("NOT_FOUND", "Unknown platform API route") };
  } catch (error) {
    if (error instanceof InvalidVersionTag) {
      return { status: HttpStatus.BAD_REQUEST, body: failure("invalid_version_tag", error.message) };
    }
    return errorResponse(error);
  }
}

/**
 * Registers the HTTP surface for admin system version/update. `dispatch` maps an internal
 * `PlatformRequest` through the async resolver and sends the response (mirrors
 * `registerSetupRoutes` in `setup-routes.ts`).
 */
export function registerSystemRoutes(
  routes: SystemRouteRegistry,
  dispatch: (response: SystemHttpResponse, request: PlatformRequest) => void
): void {
  routes.get("/admin/system/version", (request, response) =>
    dispatch(response, { method: "GET", path: "/admin/system/version", headers: request.headers })
  );
  routes.post("/admin/system/update", (request, response) =>
    dispatch(response, {
      method: "POST",
      path: "/admin/system/update",
      headers: request.headers,
      body: request.body
    })
  );
}
