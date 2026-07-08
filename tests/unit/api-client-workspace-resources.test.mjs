import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, getWorkspaceFiles, success } = await import(
  "../../packages/api-client/src/index.ts"
);

test("platform API client loads workspace source files", async () => {
  let observedUrl = "";
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    sessionToken: "evcp_session.payload.signature",
    fetcher: async (url, init) => {
      observedUrl = String(url);
      assert.equal(init.headers.get("authorization"), "Bearer evcp_session.payload.signature");
      return new Response(
        JSON.stringify(
          success({
            files: [{ path: "app/page.tsx", content: "export default function Page() {}" }]
          })
        ),
        { status: 200 }
      );
    }
  });

  const snapshot = await getWorkspaceFiles(client, "proj_001");

  assert.equal(observedUrl, "https://platform.example/api/projects/proj_001/workspace/files");
  assert.equal(snapshot.files[0].path, "app/page.tsx");
});
