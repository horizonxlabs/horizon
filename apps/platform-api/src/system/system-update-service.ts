import type { SwarmServiceEngine } from "../workspace-orchestrator/swarm-service-engine";

// service name -> image name. The 5 app services bumped on version update; infra is never touched.
const APP_SERVICES: Record<string, string> = {
  "evcp_platform-api": "evcp-platform-api",
  "evcp_admin-web": "evcp-admin-web",
  "evcp_creator-web": "evcp-creator-web",
  "evcp_app-store-pwa": "evcp-app-store-pwa",
  "evcp_workspace-next-image": "evcp-workspace-next"
};
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class InvalidVersionTag extends Error {}

export function createSystemUpdateService(deps: { engine: SwarmServiceEngine; env?: NodeJS.ProcessEnv }) {
  const env = deps.env ?? process.env;
  const stack = "evcp";
  return {
    async getSystemVersion() {
      const services = await deps.engine.listStackServices(stack);
      const appServices = services
        .filter((s) => s.name in APP_SERVICES)
        .map((s) => ({ name: s.name, image: s.image, tag: s.image.split(":").pop() ?? "" }));
      return { currentVersion: env.EVCP_VERSION ?? "", imageRepository: env.EVCP_IMAGE_REPOSITORY ?? "", appServices };
    },
    async updateToVersion(targetTag: string) {
      if (!TAG_RE.test(targetTag)) throw new InvalidVersionTag("invalid version tag");
      const repo = env.EVCP_IMAGE_REPOSITORY;
      if (!repo) throw new Error("EVCP_IMAGE_REPOSITORY is not set");
      const ref = (svc: string) => `${repo}/${APP_SERVICES[svc]}:${targetTag}`;
      for (const svc of Object.keys(APP_SERVICES)) {
        if (svc === "evcp_platform-api") continue;
        await deps.engine.updateServiceImage(svc, ref(svc));
      }
      // Self last, fire-and-forget: this restarts platform-api, so do not await; the UI polls.
      void deps.engine.updateServiceImage("evcp_platform-api", ref("evcp_platform-api")).catch(() => {});
      return { accepted: true, targetVersion: targetTag };
    }
  };
}

export type SystemUpdateService = ReturnType<typeof createSystemUpdateService>;
