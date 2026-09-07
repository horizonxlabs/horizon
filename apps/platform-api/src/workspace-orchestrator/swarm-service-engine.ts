import { type DockerRequestFn, nodeSocketRequest } from "./docker-socket-engine";

export interface StackService {
  id: string;
  name: string;
  image: string;
}

export interface SwarmServiceEngine {
  listStackServices(stack: string): Promise<StackService[]>;
  updateService(
    serviceName: string,
    update: { image?: string; envPatch?: Record<string, string> }
  ): Promise<void>;
  updateServiceImage(serviceName: string, image: string): Promise<void>;
  updateServiceEnv(serviceName: string, envPatch: Record<string, string>): Promise<void>;
}

export function createSwarmServiceEngine(
  opts: { socketPath?: string; request?: DockerRequestFn } = {}
): SwarmServiceEngine {
  const request = opts.request ?? nodeSocketRequest(opts.socketPath ?? "/var/run/docker.sock");
  return {
    async listStackServices(stack) {
      const filters = encodeURIComponent(
        JSON.stringify({ label: [`com.docker.stack.namespace=${stack}`] })
      );
      const res = await request({ method: "GET", path: `/services?filters=${filters}` });
      if (res.status >= 400) throw new Error(`docker service list failed: ${res.status}`);
      const list = (await res.json()) as Array<Record<string, any>>;
      return list.map((s) => ({
        id: String(s.ID ?? ""),
        name: String(s.Spec?.Name ?? ""),
        image: String(s.Spec?.TaskTemplate?.ContainerSpec?.Image ?? "")
      }));
    },
    updateServiceImage(serviceName, image) {
      return this.updateService(serviceName, { image });
    },
    updateServiceEnv(serviceName, envPatch) {
      return this.updateService(serviceName, { envPatch });
    },
    async updateService(serviceName, { image, envPatch }) {
      const name = encodeURIComponent(serviceName);
      const res = await request({ method: "GET", path: `/services/${name}` });
      if (res.status >= 400)
        throw new Error(`docker service inspect ${serviceName} failed: ${res.status}`);
      const svc = (await res.json()) as Record<string, any>;
      const version = svc.Version?.Index;
      const spec = svc.Spec;
      const cs = spec.TaskTemplate.ContainerSpec;
      if (image !== undefined) cs.Image = image;
      if (envPatch !== undefined) {
        const env: string[] = Array.isArray(cs.Env) ? [...cs.Env] : [];
        for (const [k, v] of Object.entries(envPatch)) {
          const i = env.findIndex((e) => e.startsWith(`${k}=`));
          if (i >= 0) env[i] = `${k}=${v}`;
          else env.push(`${k}=${v}`);
        }
        cs.Env = env;
      }
      spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate ?? 0) + 1;
      const upd = await request({
        // Pass the raw object — nodeSocketRequest JSON-encodes non-Buffer bodies itself, so
        // JSON.stringify here would double-encode and the daemon would reject the ServiceSpec.
        method: "POST",
        path: `/services/${name}/update?version=${version}`,
        body: spec,
        contentType: "application/json"
      });
      if (upd.status >= 400)
        throw new Error(`docker service update ${serviceName} failed: ${upd.status}`);
    }
  };
}
