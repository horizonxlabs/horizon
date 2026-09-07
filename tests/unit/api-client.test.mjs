import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, success } = await import("../../packages/api-client/src/index.ts");

test("platform API client exposes the server-authorized physical preview key", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "creator@company.com",
    fetcher: async (url, init) => {
      assert.equal(
        String(url),
        "https://platform.example/api/projects/prj_alpha/workspace/preview-session"
      );
      assert.equal(init.method, "POST");
      return new Response(
        JSON.stringify(success({ authorized: true, previewKey: "warm-resource-1" })),
        { status: 200 }
      );
    }
  });

  assert.deepEqual(await client.authorizeWorkspacePreview("prj_alpha"), {
    authorized: true,
    previewKey: "warm-resource-1"
  });
});
