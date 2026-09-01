import test from "node:test";

const REQUIRED_LIVE_VARIABLES = [
  "EVCP_LIVE_BASE_URL",
  "EVCP_LIVE_CREATOR_TOKEN",
  "EVCP_LIVE_PROJECT_ID",
  "EVCP_LIVE_SUBDOMAIN"
];
const missingLiveVariables = REQUIRED_LIVE_VARIABLES.filter((name) => !process.env[name]?.trim());
const LIVE_TIMEOUT_MS = 15 * 60 * 1_000;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function isLocalHostname(hostname) {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function apiEndpoint(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function apiRequest(baseUrl, creatorToken, path, options = {}) {
  const operation = options.operation ?? "Live API request";
  let response;
  try {
    response = await fetch(apiEndpoint(baseUrl, path), {
      method: options.method ?? "GET",
      headers: {
        authorization: `Bearer ${creatorToken}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" })
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS)
    });
  } catch {
    throw new Error(`${operation} request failed`);
  }
  requireCondition(
    response.status === (options.expectedStatus ?? 200),
    `${operation} failed with status ${response.status}`
  );

  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw new Error(`${operation} returned invalid JSON`);
  }
  requireCondition(
    envelope && typeof envelope === "object" && "data" in envelope,
    `${operation} returned an invalid envelope`
  );
  return envelope.data;
}

async function exchangeLaunchGrant(launchUrl) {
  try {
    return await fetch(launchUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(LIVE_TIMEOUT_MS)
    });
  } catch {
    throw new Error("Launch grant exchange request failed");
  }
}

test(
  "an explicitly labelled live publish launches on its subdomain and keeps its fallback route",
  {
    skip:
      missingLiveVariables.length > 0 ? `requires ${REQUIRED_LIVE_VARIABLES.join(", ")}` : false,
    timeout: LIVE_TIMEOUT_MS
  },
  async () => {
    const baseUrl = process.env.EVCP_LIVE_BASE_URL.trim();
    const creatorToken = process.env.EVCP_LIVE_CREATOR_TOKEN.trim();
    const projectId = process.env.EVCP_LIVE_PROJECT_ID.trim();
    const subdomain = process.env.EVCP_LIVE_SUBDOMAIN.trim();
    const platformUrl = new URL(baseUrl);

    requireCondition(
      isLocalHostname(platformUrl.hostname),
      "Live publish smoke tests may target only an explicitly configured local stack"
    );
    requireCondition(
      /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,61}[a-z0-9]$/.test(subdomain),
      "EVCP_LIVE_SUBDOMAIN must be a valid normalized label"
    );

    const publishResult = await apiRequest(
      baseUrl,
      creatorToken,
      `/projects/${encodeURIComponent(projectId)}/publish`,
      {
        method: "POST",
        body: { subdomain },
        expectedStatus: 201,
        operation: "Live App Store publish"
      }
    );
    requireCondition(
      publishResult?.registryEntry?.projectId === projectId,
      "Published registry entry did not belong to the configured project"
    );
    requireCondition(
      publishResult.registryEntry.subdomain === subdomain,
      "Published registry entry did not retain the configured subdomain"
    );
    requireCondition(
      typeof publishResult.registryEntry.subdomainUrl === "string",
      "Published registry entry did not include a server-derived subdomain URL"
    );

    const registry = await apiRequest(baseUrl, creatorToken, "/app-store/registry", {
      operation: "Live registry lookup"
    });
    requireCondition(Array.isArray(registry), "Live registry lookup did not return a list");
    const registryEntry = registry.find(
      (entry) => entry.projectId === projectId && entry.subdomain === subdomain
    );
    requireCondition(registryEntry, "Configured project was absent from the live registry");
    requireCondition(
      registryEntry.subdomainUrl === publishResult.registryEntry.subdomainUrl,
      "Live registry subdomain URL did not match the publish result"
    );

    let subdomainUrl;
    try {
      subdomainUrl = new URL(registryEntry.subdomainUrl);
    } catch {
      throw new Error("Live registry returned an invalid subdomain URL");
    }
    requireCondition(
      isLocalHostname(subdomainUrl.hostname),
      "Live registry returned a non-local subdomain URL"
    );
    requireCondition(
      subdomainUrl.hostname.startsWith(`${subdomain}.`),
      "Live registry returned a subdomain URL for the wrong label"
    );
    const resourceKey = projectId.replaceAll("_", "-");
    const fallbackRoute = `/apps/${resourceKey}`;
    requireCondition(
      registryEntry.route === fallbackRoute,
      "Live registry returned an unexpected fallback route"
    );
    requireCondition(
      typeof registryEntry.slug === "string" && registryEntry.slug.length > 0,
      "Live registry entry did not include a Store app slug"
    );

    const launchSession = await apiRequest(
      baseUrl,
      creatorToken,
      `/store/apps/${encodeURIComponent(registryEntry.slug)}/launch-session`,
      {
        method: "POST",
        body: { routePath: fallbackRoute },
        operation: "Live Store launch session"
      }
    );
    requireCondition(
      launchSession?.authorized === true && typeof launchSession.launchUrl === "string",
      "Live Store launch session was not authorized"
    );
    let launchUrl;
    try {
      launchUrl = new URL(launchSession.launchUrl);
    } catch {
      throw new Error("Live Store launch session returned an invalid target");
    }
    requireCondition(
      launchUrl.origin === subdomainUrl.origin && /^\/__launch\/[^/?#]+$/.test(launchUrl.pathname),
      "Live Store launch session returned an invalid target"
    );

    const exchangeResponse = await exchangeLaunchGrant(launchUrl);
    requireCondition(exchangeResponse.status === 302, "Launch grant did not redirect");
    requireCondition(
      exchangeResponse.headers.get("location") === "/",
      "Launch grant did not redirect to the subdomain root"
    );
    const setCookie = exchangeResponse.headers.get("set-cookie");
    requireCondition(
      typeof setCookie === "string" && /^evcp_app_token=[^;]+;/.test(setCookie),
      "Launch grant did not set the host app cookie"
    );
    requireCondition(/;\s*Path=\//i.test(setCookie), "Host app cookie did not use the root path");
    requireCondition(/;\s*HttpOnly/i.test(setCookie), "Host app cookie was not HttpOnly");
    requireCondition(/;\s*SameSite=Lax/i.test(setCookie), "Host app cookie was not SameSite=Lax");
    requireCondition(/;\s*Max-Age=900/i.test(setCookie), "Host app cookie had the wrong TTL");
    requireCondition(!/;\s*Domain=/i.test(setCookie), "Host app cookie was not host-only");
    const appCookie = setCookie.slice(0, setCookie.indexOf(";"));

    let rootResponse;
    try {
      rootResponse = await fetch(new URL("/", subdomainUrl), {
        headers: { cookie: appCookie },
        redirect: "manual",
        signal: AbortSignal.timeout(LIVE_TIMEOUT_MS)
      });
    } catch {
      throw new Error("Authenticated subdomain root request failed");
    }
    requireCondition(
      rootResponse.status >= 200 && rootResponse.status < 400,
      `Authenticated subdomain root was unavailable with status ${rootResponse.status}`
    );

    let fallbackResponse;
    try {
      fallbackResponse = await fetch(new URL(fallbackRoute, platformUrl.origin), {
        headers: { authorization: `Bearer ${creatorToken}` },
        redirect: "manual",
        signal: AbortSignal.timeout(LIVE_TIMEOUT_MS)
      });
    } catch {
      throw new Error("Authenticated fallback app route request failed");
    }
    requireCondition(
      fallbackResponse.status >= 200 && fallbackResponse.status < 400,
      `Fallback app route was unavailable with status ${fallbackResponse.status}`
    );
  }
);
