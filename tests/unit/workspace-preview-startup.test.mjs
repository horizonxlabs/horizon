import assert from "node:assert/strict";
import test from "node:test";
import { readPreviewStartup } from "../../apps/platform-api/src/workspace-orchestrator/preview-startup.ts";
import { registerWorkspacePreviewHttp } from "../../apps/platform-api/src/workspace-orchestrator/preview-http-routes.ts";

const record = { projectId: "prj_test", resourceKey: "physical", containerId: "container" };
test("startup exposes only known phases, never process output or credentials", async () => {
  const docker = {
    inspectContainer: async () => ({ containerId: "container", running: true }),
    execInContainer: async () => ({
      stdout: JSON.stringify({ phase: "compiling", secret: "private" })
    })
  };
  assert.deepEqual(await readPreviewStartup(docker, record), { phase: "compiling" });
  docker.execInContainer = async () => ({
    stdout: JSON.stringify({ phase: "arbitrary private log" })
  });
  assert.deepEqual(await readPreviewStartup(docker, record), { phase: "starting" });
  docker.inspectContainer = async () => ({ containerId: "container", running: false });
  assert.deepEqual(await readPreviewStartup(docker, record), { phase: "preparing" });
});
function fixture(allowed = true) {
  const handlers = {},
    activity = [],
    reads = [];
  registerWorkspacePreviewHttp({
    routes: { get: (path, fn) => (handlers.get = fn), post: (path, fn) => (handlers.post = fn) },
    authorizeProject: async () => {
      if (!allowed) throw new Error("forbidden");
      return { id: "prj_test" };
    },
    orchestrator: {
      resolvePreviewLocation: async () => ({ previewKey: "physical" }),
      markActivity: (id) => activity.push(id),
      readPreviewStartup: async (id) => {
        reads.push(id);
        return { phase: "dependencies" };
      }
    },
    secureCookie: true
  });
  const response = {
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
    setHeader() {}
  };
  const request = { params: { projectId: "prj_test" }, headers: { authorization: "Bearer test" } };
  return { handlers, response, request, activity, reads };
}
test("authorized preview renewal keeps a project active even while viewing Docs", async () => {
  const f = fixture();
  await f.handlers.post(f.request, f.response);
  assert.equal(f.response.code, 200);
  assert.deepEqual(f.activity, ["prj_test"]);
});
test("startup status requires project authorization and does not wake or mark it active", async () => {
  const f = fixture();
  await f.handlers.get(f.request, f.response);
  assert.deepEqual(f.response.body.data, { phase: "dependencies" });
  assert.deepEqual(f.activity, []);
  const denied = fixture(false);
  await denied.handlers.get(denied.request, denied.response);
  assert.equal(denied.response.code, 403);
  assert.deepEqual(denied.reads, []);
});
