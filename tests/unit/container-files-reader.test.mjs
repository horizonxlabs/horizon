import test from "node:test";
import assert from "node:assert/strict";
import {
  createContainerFileReader,
  createWorkspaceFileBrowserReader
} from "../../apps/platform-api/src/generation-loop/container-files.ts";

// Regression: the Docker exec stream returns CRLF line endings. The reader must normalize them to
// LF, otherwise (a) the ===EVCPFILE:…=== marker regex (anchored on \n) matches nothing and the AI
// is fed zero files, and (b) the file content it does see would not match the LF file on disk, so
// every edit SEARCH fails. This was the root cause of "the AI rewrote/failed instead of editing".
test("reader parses CRLF marker output into LF file contents", async () => {
  const crlf =
    "===EVCPFILE:app/page.tsx===\r\n" +
    "\r\n" +
    "export default function Home() {\r\n" +
    '  return <h1>Hi</h1>;\r\n' +
    "}\r\n" +
    "\r\n" +
    "===EVCPFILE:lib/db.ts===\r\n" +
    "export const x = 1;\r\n" +
    "\r\n";
  const docker = {
    async execInContainer() {
      return { stdout: crlf, stderr: "", exitCode: 0 };
    }
  };
  const files = await createContainerFileReader(docker).read("cid");
  assert.equal(files.length, 2, "both files parsed");
  const page = files.find((f) => f.path === "app/page.tsx");
  assert.ok(page, "app/page.tsx present");
  assert.ok(!page.content.includes("\r"), "content normalized to LF (no CR)");
  assert.match(page.content, /export default function Home/);
});

test("reader returns [] (never throws) when the exec fails", async () => {
  const docker = {
    async execInContainer() {
      throw new Error("boom");
    }
  };
  assert.deepEqual(await createContainerFileReader(docker).read("cid"), []);
});

test("workspace file browser reader scans beyond the AI context cap", async () => {
  let observedScript = "";
  const stdout = Array.from({ length: 10 }, (_, index) => {
    const fileNumber = index + 1;
    return `===EVCPFILE:app/file-${fileNumber}.tsx===\nexport const file${fileNumber} = ${fileNumber};\n`;
  }).join("");
  const docker = {
    async execInContainer(_containerId, cmd) {
      observedScript = cmd[2];
      return { stdout, stderr: "", exitCode: 0 };
    }
  };

  const files = await createWorkspaceFileBrowserReader(docker).read("cid");

  assert.equal(files.length, 10);
  assert.equal(files.at(-1).path, "app/file-10.tsx");
  assert.match(observedScript, /find \./);
  assert.doesNotMatch(observedScript, /head -8/);
});
