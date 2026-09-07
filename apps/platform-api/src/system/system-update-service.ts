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

function imageTag(image: string): string {
  const imageWithoutDigest = image.split("@", 1)[0] ?? "";
  const tagSeparator = imageWithoutDigest.lastIndexOf(":");
  return tagSeparator > imageWithoutDigest.lastIndexOf("/")
    ? imageWithoutDigest.slice(tagSeparator + 1)
    : "";
}

export function createSystemUpdateService(deps: {
  engine: SwarmServiceEngine;
  env?: NodeJS.ProcessEnv;
}) {
  const env = deps.env ?? process.env;
  const stack = "evcp";
  return {
    async getSystemVersion() {
      const services = await deps.engine.listStackServices(stack);
      const appServices = services
        .filter((s) => s.name in APP_SERVICES)
        .map((s) => ({ name: s.name, image: s.image, tag: imageTag(s.image) }));
      const currentVersion =
        appServices.find((service) => service.name === "evcp_platform-api")?.tag ??
        env.EVCP_VERSION ??
        "";
      return { currentVersion, imageRepository: env.EVCP_IMAGE_REPOSITORY ?? "", appServices };
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
      void deps.engine
        .updateService("evcp_platform-api", {
          image: ref("evcp_platform-api"),
          envPatch: {
            EVCP_VERSION: targetTag,
            EVCP_WORKSPACE_IMAGE: `${repo}/evcp-workspace-next:${targetTag}`
          }
        })
        .catch(() => {});
      return { accepted: true, targetVersion: targetTag };
    }
  };
}

export type SystemUpdateService = ReturnType<typeof createSystemUpdateService>;
