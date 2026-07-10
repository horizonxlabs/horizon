import { HttpStatus } from "@nestjs/common";
import { failure, success } from "@evcp/api-client";
import { getMockPermissions } from "@evcp/auth-sdk";
import type {
  PersistenceAwarePlatformApiServices,
  PlatformRequest,
  PlatformResponse
} from "./app-factory";
import type { PlatformUser } from "./platform-services";
import { createUserWithRole } from "./auth/prisma-credential-store";
import type { BusinessSettingsRecord } from "./persistence/business-settings-repositories";

// Minimal structural types mirroring the HTTP registrar in app-factory. Kept local so this
// focused module can register its own routes without widening app-factory's exported surface.
type SetupHttpRequest = {
  headers: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
};
type SetupHttpResponse = {
  status: (code: number) => SetupHttpResponse;
  json: (body: unknown) => void;
};
type SetupRouteRegistry = {
  get: (path: string, handler: (req: SetupHttpRequest, res: SetupHttpResponse) => void) => void;
  post: (path: string, handler: (req: SetupHttpRequest, res: SetupHttpResponse) => void) => void;
  put: (path: string, handler: (req: SetupHttpRequest, res: SetupHttpResponse) => void) => void;
};

export function isPersistenceBusinessSettingsRoute(request: PlatformRequest): boolean {
  return (
    request.path === "/setup/status" ||
    request.path === "/setup/initialize" ||
    request.path === "/admin/business-settings"
  );
}

/**
 * Resolves the first-run setup + business-settings routes against the business-settings
 * persistence layer. Returns `null` when the request is not a setup route, so the caller can
 * continue its own dispatch chain (mirrors `registerProjectDbRoutes` in `project-database.ts`:
 * a focused module owns a cohesive slice of the API).
 */
export async function resolveSetupRequest(
  request: PlatformRequest,
  services: PersistenceAwarePlatformApiServices,
  resolveActor: () => Promise<PlatformUser>
): Promise<PlatformResponse | null> {
  const businessSettingsPersistence = services.businessSettingsPersistence;
  if (!businessSettingsPersistence || !isPersistenceBusinessSettingsRoute(request)) return null;
  const { corePersistenceClient, credentialService } = services;

  if (request.method === "GET" && request.path === "/setup/status") {
    const status = await businessSettingsPersistence.getSetupStatus();
    return { status: HttpStatus.OK, body: success(status) };
  }

  if (
    corePersistenceClient &&
    credentialService &&
    request.method === "POST" &&
    request.path === "/setup/initialize"
  ) {
    const existingStatus = await businessSettingsPersistence.getSetupStatus();
    if (existingStatus.setupCompleted) {
      return {
        status: HttpStatus.CONFLICT,
        body: failure("setup_already_completed", "Setup has already been completed")
      };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const businessBody = (body.business ?? {}) as Record<string, unknown>;
    const adminBody = (body.admin ?? {}) as Record<string, unknown>;

    const businessName = String(businessBody.businessName ?? "").trim();
    const email = String(adminBody.email ?? "")
      .trim()
      .toLowerCase();
    const name = String(adminBody.name ?? "").trim();
    const password = String(adminBody.password ?? "");

    if (!businessName || !name || !isValidEmail(email) || password.length < 8) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: failure(
          "invalid_input",
          "Business name, a valid admin email, name, and an 8+ character password are required"
        )
      };
    }

    const existingUser = await corePersistenceClient.platformUser.findUnique({ where: { email } });
    if (existingUser) {
      return {
        status: HttpStatus.CONFLICT,
        body: failure("email_exists", "That email already exists")
      };
    }

    const id = `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const created = await createUserWithRole(corePersistenceClient, {
      id,
      email,
      name,
      role: "admin"
    });

    const passwordResult = await credentialService.setPassword(created.id, password, {
      mustChange: false
    });
    if (!passwordResult.ok) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: failure("invalid_input", "Password must be at least 8 characters")
      };
    }

    services.identity.registerUser({
      id: created.id,
      email: created.email,
      name: created.name,
      role: "admin",
      status: created.status as PlatformUser["status"],
      permissions: getMockPermissions("admin")
    } as PlatformUser);

    await businessSettingsPersistence.completeSetup({
      businessName,
      timezone: businessBody.timezone ? String(businessBody.timezone) : undefined,
      locale: businessBody.locale ? String(businessBody.locale) : undefined,
      contactEmail: businessBody.contactEmail ? String(businessBody.contactEmail) : null,
      website: businessBody.website ? String(businessBody.website) : null,
      logoUrl: businessBody.logoUrl ? String(businessBody.logoUrl) : null,
      industry: businessBody.industry ? String(businessBody.industry) : null
    });

    return { status: HttpStatus.CREATED, body: success({ setupCompleted: true }) };
  }

  if (request.method === "GET" && request.path === "/admin/business-settings") {
    const actor = await resolveActor();
    services.auth.requireRole(actor, ["admin"]);
    const record = await businessSettingsPersistence.getBusinessSettings();
    return { status: HttpStatus.OK, body: success(mapBusinessSettingsDto(record)) };
  }

  if (request.method === "POST" && request.path === "/admin/business-settings") {
    const actor = await resolveActor();
    const settingsBody = (request.body ?? {}) as Record<string, unknown>;
    const record = await businessSettingsPersistence.saveBusinessSettings(actor, {
      businessName: String(settingsBody.businessName ?? ""),
      timezone: settingsBody.timezone ? String(settingsBody.timezone) : undefined,
      locale: settingsBody.locale ? String(settingsBody.locale) : undefined,
      contactEmail: settingsBody.contactEmail ? String(settingsBody.contactEmail) : null,
      website: settingsBody.website ? String(settingsBody.website) : null,
      logoUrl: settingsBody.logoUrl ? String(settingsBody.logoUrl) : null,
      industry: settingsBody.industry ? String(settingsBody.industry) : null
    });
    return { status: HttpStatus.OK, body: success(mapBusinessSettingsDto(record)) };
  }

  return null;
}

/**
 * Registers the HTTP surface for setup + business-settings. `dispatch` maps an internal
 * `PlatformRequest` through the async executor and sends the response. The `PUT` verb is
 * mapped onto an internal `POST` because the platform request abstraction carries only GET/POST.
 */
export function registerSetupRoutes(
  routes: SetupRouteRegistry,
  dispatch: (response: SetupHttpResponse, request: PlatformRequest) => void
): void {
  routes.get("/setup/status", (request, response) =>
    dispatch(response, { method: "GET", path: "/setup/status", headers: request.headers })
  );
  routes.post("/setup/initialize", (request, response) =>
    dispatch(response, {
      method: "POST",
      path: "/setup/initialize",
      headers: request.headers,
      body: request.body
    })
  );
  routes.get("/admin/business-settings", (request, response) =>
    dispatch(response, {
      method: "GET",
      path: "/admin/business-settings",
      headers: request.headers
    })
  );
  routes.put("/admin/business-settings", (request, response) =>
    dispatch(response, {
      method: "POST",
      path: "/admin/business-settings",
      headers: request.headers,
      body: request.body
    })
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapBusinessSettingsDto(record: BusinessSettingsRecord | null): {
  businessName: string;
  timezone: string;
  locale: string;
  contactEmail: string | null;
  website: string | null;
  logoUrl: string | null;
  industry: string | null;
  setupCompleted: boolean;
  setupCompletedAt: string | null;
} {
  if (!record) {
    return {
      businessName: "",
      timezone: "Asia/Bangkok",
      locale: "th",
      contactEmail: null,
      website: null,
      logoUrl: null,
      industry: null,
      setupCompleted: false,
      setupCompletedAt: null
    };
  }
  const setupCompletedAt = toIsoOrNull(record.setupCompletedAt);
  return {
    businessName: record.businessName,
    timezone: record.timezone,
    locale: record.locale,
    contactEmail: record.contactEmail ?? null,
    website: record.website ?? null,
    logoUrl: record.logoUrl ?? null,
    industry: record.industry ?? null,
    setupCompleted: Boolean(setupCompletedAt),
    setupCompletedAt
  };
}
