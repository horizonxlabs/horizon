import { type DockerRequestFn, nodeSocketRequest } from "./docker-socket-engine";

export interface StackService {
  id: string;
  name: string;
  image: string;
}

export interface SwarmServiceEngine {
  listStackServices(stack: string): Promise<StackService[]>;
  updateServiceImage(serviceName: string, image: string): Promise<void>;
}

export function createSwarmServiceEngine(
  opts: { socketPath?: string; request?: DockerRequestFn } = {}
): SwarmServiceEngine {
  const request = opts.request ?? nodeSocketRequest(opts.socketPath ?? "/var/run/docker.sock");
  return {
    async listStackServices(stack) {
      const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.stack.namespace=${stack}`] }));
      const res = await request({ method: "GET", path: `/services?filters=${filters}` });
      if (res.status >= 400) throw new Error(`docker service list failed: ${res.status}`);
      const list = (await res.json()) as Array<Record<string, any>>;
      return list.map((s) => ({
        id: String(s.ID ?? ""),
        name: String(s.Spec?.Name ?? ""),
        image: String(s.Spec?.TaskTemplate?.ContainerSpec?.Image ?? "")
      }));
    },
    async updateServiceImage(serviceName, image) {
      const name = encodeURIComponent(serviceName);
      const res = await request({ method: "GET", path: `/services/${name}` });
      if (res.status >= 400) throw new Error(`docker service inspect ${serviceName} failed: ${res.status}`);
      const svc = (await res.json()) as Record<string, any>;
      const version = svc.Version?.Index;
      const spec = svc.Spec;
      spec.TaskTemplate.ContainerSpec.Image = image;
      spec.TaskTemplate.ForceUpdate = (spec.TaskTemplate.ForceUpdate ?? 0) + 1;
      const upd = await request({
        // Pass the raw object — nodeSocketRequest JSON-encodes non-Buffer bodies itself, so
        // JSON.stringify here would double-encode and the daemon would reject the ServiceSpec.
        method: "POST",
        path: `/services/${name}/update?version=${version}`,
        body: spec,
        contentType: "application/json"
      });
      if (upd.status >= 400) throw new Error(`docker service update ${serviceName} failed: ${upd.status}`);
    }
  };
}
