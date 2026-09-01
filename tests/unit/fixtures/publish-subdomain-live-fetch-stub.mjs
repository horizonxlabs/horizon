import { appendFileSync } from "node:fs";

const mode = process.env.EVCP_LIVE_FETCH_STUB_MODE;
const tracePath = process.env.EVCP_LIVE_FETCH_TRACE;
const projectId = process.env.EVCP_LIVE_PROJECT_ID;
const subdomain = process.env.EVCP_LIVE_SUBDOMAIN;
const fallbackRoute = `/apps/${projectId.replaceAll("_", "-")}`;
const remoteSubdomainUrl = `http://${subdomain}.apps.example.test:9800`;
const localSubdomainUrl = `http://${subdomain}.localhost:9800`;
let requestCount = 0;

globalThis.fetch = async (_input, init = {}) => {
  requestCount += 1;
  appendFileSync(tracePath, "fetch\n");
  if (mode !== "malformed-fallback-token" || requestCount === 6) new Headers(init.headers);

  if (mode === "remote-subdomain") {
    if (requestCount === 1) {
      return Response.json(
        {
          data: {
            registryEntry: {
              projectId,
              slug: "live-safety-app",
              subdomain,
              subdomainUrl: remoteSubdomainUrl,
              route: fallbackRoute
            }
          }
        },
        { status: 201 }
      );
    }
    if (requestCount === 2) {
      return Response.json({
        data: [
          {
            projectId,
            slug: "live-safety-app",
            subdomain,
            subdomainUrl: remoteSubdomainUrl,
            route: fallbackRoute
          }
        ]
      });
    }
    throw new Error("FOLLOW_UP_FETCH_OCCURRED");
  }

  if (mode === "malformed-fallback-token") {
    if (requestCount === 1) {
      return Response.json(
        {
          data: {
            registryEntry: {
              projectId,
              slug: "live-safety-app",
              subdomain,
              subdomainUrl: localSubdomainUrl,
              route: fallbackRoute
            }
          }
        },
        { status: 201 }
      );
    }
    if (requestCount === 2) {
      return Response.json({
        data: [
          {
            projectId,
            slug: "live-safety-app",
            subdomain,
            subdomainUrl: localSubdomainUrl,
            route: fallbackRoute
          }
        ]
      });
    }
    if (requestCount === 3) {
      return Response.json({
        data: {
          authorized: true,
          launchUrl: `${localSubdomainUrl}/__launch/fixture-launch`
        }
      });
    }
    if (requestCount === 4) {
      return new Response(null, {
        status: 302,
        headers: {
          location: "/",
          "set-cookie":
            "evcp_app_token=fixture-cookie; Path=/; HttpOnly; SameSite=Lax; Max-Age=900"
        }
      });
    }
    if (requestCount === 5) return new Response("ok");
  }

  throw new Error("Unexpected live fetch stub mode");
};
