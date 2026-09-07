import test from "node:test";
import assert from "node:assert/strict";

const { registerPreviewSessionRoute } =
  await import("../../apps/platform-api/src/workspace-orchestrator/preview-session-route.ts");

test("preview session returns and scopes the authorized physical runtime key", async () => {
  let handler;
  registerPreviewSessionRoute({
    routes: {
      post(_path, next) {
        handler = next;
      }
    },
    async authorize() {
      return { previewKey: "warm-resource-1" };
    },
    secureCookie: true
  });
  const response = {
    statusCode: 0,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    }
  };

  await handler(
    { headers: { authorization: "Bearer opaque-test-token" }, params: { projectId: "prj_alpha" } },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.data, { authorized: true, previewKey: "warm-resource-1" });
  assert.match(response.headers["Set-Cookie"], /Path=\/preview\/warm-resource-1/);
  assert.match(response.headers["Set-Cookie"], /HttpOnly; SameSite=Strict; Max-Age=900; Secure$/);
});
