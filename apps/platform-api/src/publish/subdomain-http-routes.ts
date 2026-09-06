import type * as NodeHttp from "node:http";
import { subdomainFromHostname } from "@evcp/api-client";
import type { WorkspaceAuthContext } from "../workspace-orchestrator/routes";
import type { DeploymentStore } from "./deployment-store";
import type { LaunchGrantStore } from "./launch-grant-store";
import { resolveAppsTarget } from "./routes";

type HeaderBag = Record<string, string | string[] | undefined>;

type RawRequest = {
  params: Record<string, string>;
  method: string;
  headers: HeaderBag;
  url: string;
  originalUrl: string;
  body?: unknown;
  on: (event: string, cb: (chunk: unknown) => void) => void;
};

type RawResponse = {
  status: (code: number) => { json: (body: unknown) => void };
  statusCode: number;
  setHeader: (key: string, value: string | string[] | number) => void;
  end: (body?: unknown) => void;
  write: (chunk: unknown) => void;
  headersSent: boolean;
};

type RawApp = {
  all(path: string, handler: (request: RawRequest, response: RawResponse) => void): void;
};

export type PublishedSubdomainRegistryEntry = {
  appSlug: string;
  projectId: string;
  routePath: string;
  subdomain: string;
  visibility: "public" | "restricted";
};

function firstHeader(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function deleteCredentialHeaders(headers: HeaderBag): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "authorization" || key.toLowerCase() === "cookie") {
      delete headers[key];
    }
  }
}

export function appTokenAuthorizationHeaders(headers: HeaderBag): HeaderBag {
  const authorizationHeaders = { ...headers };
  deleteCredentialHeaders(authorizationHeaders);
  const encodedToken = firstHeader(headers.cookie).match(/(?:^|;\s*)evcp_app_token=([^;]+)/)?.[1];
  if (!encodedToken) return authorizationHeaders;
  try {
    authorizationHeaders.authorization = `Bearer ${decodeURIComponent(encodedToken)}`;
  } catch {
    // A malformed app cookie is handled by the normal unauthorized policy.
  }
  return authorizationHeaders;
}

function browserPath(originalUrl: string): string {
  const rewritten = originalUrl || "/__subdomain/";
  const withoutInternalPrefix = rewritten.replace(/^\/__subdomain(?=\/|\?|$)/, "");
  return withoutInternalPrefix || "/";
}

export function publishedSubdomainProxyPath(originalUrl: string, routePath: string): string {
  const requested = browserPath(originalUrl);
  const queryIndex = requested.indexOf("?");
  const pathname = queryIndex >= 0 ? requested.slice(0, queryIndex) : requested;
  const query = queryIndex >= 0 ? requested.slice(queryIndex) : "";
  if (pathname === routePath || pathname.startsWith(`${routePath}/`)) return requested;
  if (pathname === "/") return `${routePath}${query}`;
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${routePath}${suffix}${query}`;
}

function publishedSubdomainBrowserLocation(location: string, routePath: string): string {
  const normalizedRoute = routePath.replace(/\/$/, "");
  const stripRoute = (value: string) => {
    if (value === normalizedRoute || value === `${normalizedRoute}/`) return "/";
    if (value.startsWith(`${normalizedRoute}/`)) return value.slice(normalizedRoute.length);
    if (value.startsWith(`${normalizedRoute}?`) || value.startsWith(`${normalizedRoute}#`)) {
      return `/${value.slice(normalizedRoute.length)}`;
    }
    return value;
  };

  if (location.startsWith("/")) return stripRoute(location);
  try {
    const absolute = new URL(location);
    const routedLocation = `${absolute.pathname}${absolute.search}${absolute.hash}`;
    const publicLocation = stripRoute(routedLocation);
    return publicLocation === routedLocation ? location : publicLocation;
  } catch {
    return location;
  }
}

export function proxyPublishedDeployment(input: {
  nodeHttp: typeof NodeHttp;
  request: RawRequest;
  response: RawResponse;
  upstream: string;
  path: string;
  browserRoutePrefixToStrip?: string;
}): void {
  const target = new URL(input.upstream);
  const browserRoutePrefixToStrip = input.browserRoutePrefixToStrip;
  const forwardHeaders: HeaderBag = { ...input.request.headers, host: target.host };
  deleteCredentialHeaders(forwardHeaders);
  const proxyRequest = input.nodeHttp.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      method: input.request.method,
      path: input.path,
      headers: forwardHeaders
    },
    (proxyResponse) => {
      input.response.statusCode = proxyResponse.statusCode ?? 502;
      for (const [key, value] of Object.entries(proxyResponse.headers)) {
        if (value === undefined) continue;
        const publicValue =
          key.toLowerCase() === "location" && browserRoutePrefixToStrip
            ? Array.isArray(value)
              ? value.map((location) =>
                  publishedSubdomainBrowserLocation(location, browserRoutePrefixToStrip)
                )
              : publishedSubdomainBrowserLocation(String(value), browserRoutePrefixToStrip)
            : value;
        input.response.setHeader(key, publicValue as string | string[]);
      }
      proxyResponse.pipe(input.response as unknown as NodeJS.WritableStream);
    }
  );
  proxyRequest.on("error", () => {
    if (!input.response.headersSent) {
      input.response.status(502).json({ error: "app_upstream_unreachable" });
    }
  });
  const method = String(input.request.method ?? "GET").toUpperCase();
  if (
    method === "GET" ||
    method === "HEAD" ||
    input.request.body === undefined ||
    input.request.body === null
  ) {
    proxyRequest.end();
    return;
  }
  const payload =
    typeof input.request.body === "string"
      ? input.request.body
      : JSON.stringify(input.request.body);
  proxyRequest.setHeader("content-type", "application/json");
  proxyRequest.setHeader("content-length", Buffer.byteLength(payload));
  proxyRequest.write(payload);
  proxyRequest.end();
}

function resourceKeyFromRoute(routePath: string): string | null {
  return (
    routePath
      .trim()
      .replace(/\/$/, "")
      .match(/^\/apps\/([a-zA-Z0-9_-]+)$/)?.[1] ?? null
  );
}

export function registerPublishedSubdomainHttpRoutes(input: {
  rawApp: RawApp;
  nodeHttp: typeof NodeHttp;
  deployments: DeploymentStore;
  launchGrantStore?: LaunchGrantStore;
  baseDomain: string;
  secureCookie: boolean;
  resolvePublishedSubdomain(subdomain: string): Promise<PublishedSubdomainRegistryEntry | null>;
  resolvePublishAuth(headers: HeaderBag): Promise<WorkspaceAuthContext | null>;
  canAccessDeployment(auth: WorkspaceAuthContext, projectId: string): Promise<boolean>;
  rehydrateDeployment(resourceKey: string, environment: "production"): Promise<unknown>;
}): void {
  const launchUnavailable = (response: RawResponse) => {
    response.status(403).json({ error: "launch_unavailable" });
  };
  const resolveRequest = async (request: RawRequest) => {
    const subdomain = subdomainFromHostname(firstHeader(request.headers.host), input.baseDomain);
    if (!subdomain) return null;
    const registryEntry = await input.resolvePublishedSubdomain(subdomain);
    if (!registryEntry || registryEntry.subdomain !== subdomain) return null;
    const resourceKey = resourceKeyFromRoute(registryEntry.routePath);
    return resourceKey ? { registryEntry, resourceKey } : null;
  };

  const proxyHandler = async (request: RawRequest, response: RawResponse) => {
    const resolved = await resolveRequest(request);
    if (!resolved) {
      response.status(404).json({ error: "app_not_found" });
      return;
    }
    const requestedBrowserPath = browserPath(request.originalUrl);
    const requestedPathname = requestedBrowserPath.split(/[?#]/, 1)[0];
    if (
      requestedPathname === resolved.registryEntry.routePath ||
      requestedPathname === `${resolved.registryEntry.routePath}/`
    ) {
      const canonicalBrowserPath = publishedSubdomainBrowserLocation(
        requestedBrowserPath,
        resolved.registryEntry.routePath
      );
      response.statusCode = 308;
      response.setHeader("Location", canonicalBrowserPath);
      response.end();
      return;
    }
    const deployment = await resolveAppsTarget(
      input.deployments,
      resolved.resourceKey,
      "production",
      () => input.rehydrateDeployment(resolved.resourceKey, "production")
    );
    if (!deployment.ok || deployment.projectId !== resolved.registryEntry.projectId) {
      response.status(503).json({ error: "app_unavailable" });
      return;
    }
    if (resolved.registryEntry.visibility !== "public") {
      const auth = await input.resolvePublishAuth(
        appTokenAuthorizationHeaders(request.headers ?? {})
      );
      if (!auth) {
        response.status(401).json({ error: "unauthorized" });
        return;
      }
      if (!(await input.canAccessDeployment(auth, deployment.projectId))) {
        response.status(403).json({ error: "forbidden" });
        return;
      }
    }
    proxyPublishedDeployment({
      nodeHttp: input.nodeHttp,
      request,
      response,
      upstream: deployment.upstream,
      path: publishedSubdomainProxyPath(request.originalUrl, resolved.registryEntry.routePath),
      browserRoutePrefixToStrip: resolved.registryEntry.routePath
    });
  };

  const exchangeHandler = async (request: RawRequest, response: RawResponse) => {
    if (String(request.method).toUpperCase() !== "GET") {
      response.status(405).json({ error: "method_not_allowed" });
      return;
    }
    let grant = null;
    try {
      grant = input.launchGrantStore
        ? await input.launchGrantStore.consume(String(request.params?.grant ?? ""))
        : null;
    } catch {
      launchUnavailable(response);
      return;
    }
    if (!grant) {
      launchUnavailable(response);
      return;
    }
    const resolved = await resolveRequest(request);
    if (
      !resolved ||
      grant.subdomain !== resolved.registryEntry.subdomain ||
      grant.appSlug !== resolved.registryEntry.appSlug ||
      grant.projectId !== resolved.registryEntry.projectId
    ) {
      launchUnavailable(response);
      return;
    }
    const deployment = await resolveAppsTarget(
      input.deployments,
      resolved.resourceKey,
      "production",
      () => input.rehydrateDeployment(resolved.resourceKey, "production")
    );
    if (!deployment.ok || deployment.projectId !== grant.projectId) {
      launchUnavailable(response);
      return;
    }
    const auth = await input.resolvePublishAuth({ authorization: `Bearer ${grant.bearerToken}` });
    if (!auth || !(await input.canAccessDeployment(auth, grant.projectId))) {
      launchUnavailable(response);
      return;
    }
    response.statusCode = 302;
    response.setHeader("Location", "/");
    response.setHeader(
      "Set-Cookie",
      `evcp_app_token=${encodeURIComponent(grant.bearerToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${input.secureCookie ? "; Secure" : ""}`
    );
    response.end();
  };

  input.rawApp.all("/__subdomain/__launch/:grant", exchangeHandler);
  input.rawApp.all("/__subdomain", proxyHandler);
  input.rawApp.all("/__subdomain/*splat", proxyHandler);
}
