import * as nodeHttp from "node:http";
import type { DockerEngine, DevContainerSpec } from "./docker-engine";

export interface DockerRequestResult {
  status: number;
  json: () => Promise<any>;
  text?: string;
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
              text,
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
      let message: string | undefined;
      try {
        const body = await result.json();
        message = body && typeof body.message === "string" ? body.message : undefined;
      } catch {
        message = undefined;
      }
      throw new Error(
        `docker engine ${op} failed (${result.status})${message ? `: ${message}` : ""}`
      );
    }
  };

  return {
    async createContainer(spec) {
      const createOnce = () =>
        request({
          method: "POST",
          path: `/containers/create?name=${spec.name}`,
          body: buildCreateContainerBody(spec)
        });

      let result = await createOnce();
      if (result.status === 409) {
        await request({ method: "DELETE", path: `/containers/${spec.name}?force=true` });
        result = await createOnce();
      }
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
    },
    async execInContainer(containerId, cmd) {
      const create = await request({
        method: "POST",
        path: `/containers/${containerId}/exec`,
        body: { Cmd: cmd, AttachStdout: true, AttachStderr: true, Tty: true }
      });
      await expect("exec-create", create, [201]);
      const { Id: execId } = await create.json();

      const start = await request({
        method: "POST",
        path: `/exec/${execId}/start`,
        body: { Detach: false, Tty: true }
      });
      await expect("exec-start", start, [200]);
      const stdout = start.text ?? "";

      const inspect = await request({ method: "GET", path: `/exec/${execId}/json` });
      await expect("exec-inspect", inspect, [200]);
      const { ExitCode } = await inspect.json();

      return { stdout, stderr: "", exitCode: Number(ExitCode ?? 0) };
    },
    async commitContainer(containerId, imageTag) {
      const [repo, tag] = imageTag.includes(":") ? imageTag.split(":") : [imageTag, "latest"];
      const result = await request({
        method: "POST",
        path: `/commit?container=${containerId}&repo=${repo}&tag=${tag}`
      });
      await expect("commit", result, [201]);
      const payload = await result.json();
      return { imageId: String(payload.Id) };
    }
  };
}
