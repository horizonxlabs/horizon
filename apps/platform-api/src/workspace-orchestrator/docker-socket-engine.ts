import * as nodeHttp from "node:http";
import type { DockerEngine, DevContainerSpec } from "./docker-engine";
import { injectTarEntries, extractFirstFileContent } from "./tar-inject";

export interface DockerRequestResult {
  status: number;
  json: () => Promise<any>;
  text?: string;
  // Raw response bytes — needed for binary endpoints like `GET /containers/<id>/archive`.
  buffer?: () => Promise<Buffer>;
}

export type DockerRequestFn = (input: {
  method: string;
  path: string;
  // A Buffer body is sent verbatim (e.g. a build-context tar); any other value is JSON-encoded.
  body?: unknown;
  contentType?: string;
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
  return ({ method, path, body, contentType }) =>
    new Promise((resolve, reject) => {
      const isBuffer = Buffer.isBuffer(body);
      const payload =
        body === undefined ? undefined : isBuffer ? (body as Buffer) : JSON.stringify(body);
      const headers =
        payload === undefined
          ? {}
          : {
              "content-type": contentType ?? "application/json",
              "content-length": Buffer.byteLength(payload)
            };
      const req = nodeHttp.request({ socketPath, method, path, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const text = raw.toString("utf8");
          resolve({
            status: res.statusCode ?? 0,
            text,
            json: async () => (text ? JSON.parse(text) : {}),
            buffer: async () => raw
          });
        });
      });
      req.on("error", reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    });
}

export function createDockerSocketEngine(
  opts: {
    socketPath?: string;
    request?: DockerRequestFn;
  } = {}
): DockerEngine {
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

  // Run a command in a container and return its merged stdout (Tty:true). Shared by execInContainer
  // and the lean-context step of buildImage; safe only for textual commands (Tty merges streams).
  const runExec = async (
    containerId: string,
    cmd: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
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
      const result = await request({
        method: "DELETE",
        path: `/containers/${containerId}?force=true`
      });
      await expect("remove", result, [204]);
    },
    async inspectContainer(name) {
      const result = await request({ method: "GET", path: `/containers/${name}/json` });
      if (result.status === 404) return null;
      await expect("inspect", result, [200]);
      const payload = await result.json();
      return { containerId: String(payload.Id), running: Boolean(payload?.State?.Running) };
    },
    async execInContainer(containerId, cmd) {
      return runExec(containerId, cmd);
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
    },
    async buildImage(sourceContainerId, imageTag, dockerfilePath = "Dockerfile", extraFiles = []) {
      // 1) Build a LEAN build-context tar INSIDE the container, excluding the heavy regenerable dirs
      //    (node_modules ~730MB, .next, .git). Pulling the raw /workspace archive instead would load
      //    ~800MB into a Node Buffer (then a concat copy) — a ~1.6GB spike that OOM-kills the API
      //    process. npm ci restores node_modules and next build regenerates .next inside the image,
      //    so excluding them from the context is correct as well as necessary.
      const contextPath = "/tmp/evcp-build-context.tar";
      const okMarker = "EVCP_CONTEXT_OK";
      const make = await runExec(sourceContainerId, [
        "sh",
        "-lc",
        `cd /workspace && rm -f ${contextPath} && tar -cf ${contextPath} ` +
          `--exclude=./node_modules --exclude=./.next --exclude=./.git . && echo ${okMarker}`
      ]);
      if (!make.stdout.includes(okMarker)) {
        throw new Error(`failed to build lean context tar: ${make.stdout.trim()}`);
      }

      // 2) Pull just that tar file. `GET /archive?path=<file>` wraps the single file in an outer tar,
      //    so unwrap it to get the lean context bytes (a few MB — cheap to hold and inject into).
      const archive = await request({
        method: "GET",
        path: `/containers/${sourceContainerId}/archive?path=${encodeURIComponent(contextPath)}`
      });
      await expect("archive", archive, [200]);
      const outerTar = archive.buffer
        ? await archive.buffer()
        : Buffer.from(archive.text ?? "", "binary");
      const leanTar = extractFirstFileContent(outerTar);
      // Remove the temp context (best effort) so it never lingers in the workspace container.
      await runExec(sourceContainerId, ["sh", "-lc", `rm -f ${contextPath}`]).catch(() => undefined);

      // Inject the Dockerfile/.dockerignore into the context tar IN MEMORY (last-wins), so publish
      // never writes them into the source workspace and dirties its git tree.
      const contextTar = injectTarEntries(leanTar, extraFiles);

      // 2) Build the image from that tar context. The daemon streams NDJSON build events.
      const build = await request({
        method: "POST",
        path: `/build?t=${encodeURIComponent(imageTag)}&dockerfile=${encodeURIComponent(
          dockerfilePath
        )}&rm=true`,
        body: contextTar,
        contentType: "application/x-tar"
      });
      await expect("build", build, [200]);

      // A failed build still returns HTTP 200 but emits an `{"error"/"errorDetail"}` event line;
      // a success ends with an `{"aux":{"ID":…}}` frame. Scan the stream to decide + capture the id.
      const log = build.text ?? "";
      let imageId: string | undefined;
      for (const line of log.split("\n")) {
        if (!line.trim()) continue;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof event.error === "string" || event.errorDetail != null) {
          throw new Error(`docker engine build failed for '${imageTag}':\n${log.trim()}`);
        }
        if (event.aux && typeof event.aux.ID === "string") imageId = event.aux.ID;
      }
      return { imageId: imageId ?? imageTag };
    }
  };
}
