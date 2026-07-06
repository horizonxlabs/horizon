import * as nodeHttp from "node:http";
import type { DockerEngine, DevContainerSpec } from "./docker-engine";

export interface DockerRequestResult {
  status: number;
  json: () => Promise<any>;
}

export type DockerRequestFn = (input: {
  method: string;
  path: string;
  body?: unknown;
}) => Promise<DockerRequestResult>;

export function buildCreateContainerBody(spec: DevContainerSpec): Record<string, unknown> {
  return {
    Image: spec.image,
    Env: spec.env,
    Labels: spec.labels,
    ExposedPorts: { "3000/tcp": {} },
    HostConfig: {
      NanoCpus: spec.hostConfig.NanoCpus,
      Memory: spec.hostConfig.Memory,
      NetworkMode: spec.hostConfig.NetworkMode,
      Binds: spec.hostConfig.Binds
      // intentionally NO PortBindings — containers never publish host ports
    }
  };
}

function nodeSocketRequest(socketPath: string): DockerRequestFn {
  return ({ method, path, body }) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = nodeHttp.request(
        {
          socketPath,
          method,
          path,
          headers: payload
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
            : {}
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({
              status: res.statusCode ?? 0,
              json: async () => (text ? JSON.parse(text) : {})
            });
          });
        }
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
}

export function createDockerSocketEngine(opts: {
  socketPath?: string;
  request?: DockerRequestFn;
} = {}): DockerEngine {
  const request = opts.request ?? nodeSocketRequest(opts.socketPath ?? "/var/run/docker.sock");

  const expect = async (op: string, result: DockerRequestResult, okStatuses: number[]) => {
    if (!okStatuses.includes(result.status)) {
      throw new Error(`docker engine ${op} failed (${result.status})`);
    }
  };

  return {
    async createContainer(spec) {
      const result = await request({
        method: "POST",
        path: `/containers/create?name=${spec.name}`,
        body: buildCreateContainerBody(spec)
      });
      await expect("create", result, [201]);
      const payload = await result.json();
      return { containerId: String(payload.Id) };
    },
    async startContainer(containerId) {
      const result = await request({ method: "POST", path: `/containers/${containerId}/start` });
      await expect("start", result, [204, 304]);
    },
    async stopContainer(containerId) {
      const result = await request({ method: "POST", path: `/containers/${containerId}/stop` });
      await expect("stop", result, [204, 304]);
    },
    async removeContainer(containerId) {
      const result = await request({ method: "DELETE", path: `/containers/${containerId}?force=true` });
      await expect("remove", result, [204]);
    }
  };
}
