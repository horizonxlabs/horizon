import { failure, success } from "@evcp/api-client";
import type { LaunchGrantStore } from "./launch-grant-store";

type Headers = Record<string, string | string[] | undefined>;
type Response = {
  status(code: number): Response;
  json(body: unknown): void;
  setHeader?(name: string, value: string): void;
};

function bearerToken(headers: Headers): string | undefined {
  const raw = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.match(/^Bearer\s+(.+)$/i)?.[1];
}

function safeRuntimeRoute(routePath: string): string {
  const normalized = routePath.trim().replace(/\/$/, "");
  if (!/^\/apps\/[a-zA-Z0-9_-]+$/.test(normalized)) {
    throw new Error("Published app route is invalid");
  }
  return normalized;
}

const LAUNCH_GRANT_TTL_SECONDS = 60;

export type AppLaunchAuthorization = {
  appSlug: string;
  projectId: string;
  routePath: string;
  subdomain?: string;
  subdomainUrl?: string;
  visibility?: "public" | "restricted";
};

export function registerAppLaunchSessionRoute(input: {
  routes: {
    post(
      path: string,
      handler: (
        request: {
          headers: Headers;
          params?: Record<string, string>;
          body?: unknown;
        },
        response: Response
      ) => Promise<void>
    ): void;
  };
  authorize(
    headers: Headers,
    appSlug: string,
    requestedRoutePath?: string
  ): Promise<AppLaunchAuthorization>;
  launchGrantStore?: LaunchGrantStore;
  secureCookie?: boolean;
}): void {
  input.routes.post("/store/apps/:appSlug/launch-session", async (request, response) => {
    const token = bearerToken(request.headers);
    if (!token) {
      response.status(401).json(failure("UNAUTHORIZED", "A Platform session is required"));
      return;
    }

    try {
      const authorized = await input.authorize(
        request.headers,
        String(request.params?.appSlug ?? ""),
        typeof (request.body as { routePath?: unknown } | undefined)?.routePath === "string"
          ? ((request.body as { routePath: string }).routePath ?? undefined)
          : undefined
      );
      if (authorized.subdomainUrl) {
        if (authorized.visibility === "public") {
          response.status(200).json(
            success({ authorized: true, launchUrl: authorized.subdomainUrl })
          );
          return;
        }
        if (!authorized.subdomain || !input.launchGrantStore) {
          throw new Error("Subdomain launch is unavailable");
        }
        const grantId = await input.launchGrantStore.create(
          {
            appSlug: authorized.appSlug,
            projectId: authorized.projectId,
            routePath: safeRuntimeRoute(authorized.routePath),
            subdomain: authorized.subdomain,
            bearerToken: token
          },
          LAUNCH_GRANT_TTL_SECONDS
        );
        response.status(200).json(
          success({
            authorized: true,
            launchUrl: `${authorized.subdomainUrl}/__launch/${grantId}`
          })
        );
        return;
      }
      const routePath = safeRuntimeRoute(authorized.routePath);
      response.setHeader?.(
        "Set-Cookie",
        `evcp_app_token=${encodeURIComponent(token)}; Path=${safeRuntimeRoute(routePath)}; HttpOnly; SameSite=Strict; Max-Age=900${input.secureCookie ? "; Secure" : ""}`
      );
      response.status(200).json(success({ authorized: true, launchUrl: routePath }));
    } catch {
      response.status(403).json(failure("FORBIDDEN", "App launch is unavailable"));
    }
  });
}
