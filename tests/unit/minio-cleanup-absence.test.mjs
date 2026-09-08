import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createDockerMinioIdentityAdmin } from "../../apps/platform-api/src/workspace-orchestrator/minio-object-storage.ts";

for (const code of ["AccessDenied", "NotFound", "XMinioAdminNoSuchUser"]) {
  test(`MinIO identity cleanup ${code === "XMinioAdminNoSuchUser" ? "accepts exact per-command absence" : `propagates ${code}`}`, async () => {
    const userError = {
      status: "error",
      error: { type: "fatal", cause: { error: { Code: code } } }
    };
    const policyError = {
      status: "error",
      error: { type: "fatal", cause: { error: { Code: "XMinioAdminNoSuchPolicy" } } }
    };
    const admin = createDockerMinioIdentityAdmin({
      inspectContainer: async () => ({ containerId: "minio", running: true }),
      execInContainer: async (_id, command) => {
        // Execute the adapter's actual shell syntax: a blanket `|| true` would hide this failure.
        const script = `mc() { case "$*" in *"user remove"*) printf '%s' '${JSON.stringify(userError)}';; *) printf '%s' '${JSON.stringify(policyError)}';; esac; return 1; }; ${command.at(-1)}`;
        try {
          return {
            stdout: execFileSync("sh", ["-c", script], { encoding: "utf8" }),
            stderr: "",
            exitCode: 0
          };
        } catch (error) {
          return { stdout: error.stdout, stderr: error.stderr, exitCode: error.status };
        }
      }
    });
    const cleanup = () =>
      admin.release({ bucket: "proj-old", accessKey: "old-user", policyName: "old-policy" });
    if (code === "XMinioAdminNoSuchUser") await assert.doesNotReject(cleanup);
    else await assert.rejects(cleanup);
  });
}

test("MinIO identity cleanup accepts exact absence wrapped by Docker TTY control sequences", async () => {
  const responses = ["XMinioAdminNoSuchUser", "XMinioAdminNoSuchPolicy"].map((code) =>
    `\u001b[35;5R${JSON.stringify({
      status: "error",
      error: { type: "fatal", cause: { error: { Code: code } } }
    })}\u001b[0m`
  );
  let call = 0;
  const admin = createDockerMinioIdentityAdmin({
    inspectContainer: async () => ({ containerId: "minio", running: true }),
    execInContainer: async () => ({ stdout: responses[call++], stderr: "", exitCode: 1 })
  });

  await assert.doesNotReject(() =>
    admin.release({ bucket: "proj-old", accessKey: "old-user", policyName: "old-policy" })
  );
  assert.equal(call, 2);
});

test("MinIO identity cleanup accepts exact absence with ANSI colors inside the JSON", async () => {
  const colorize = (code) =>
    `\u001b[35;5R{"\u001b[34;1mstatus\u001b[0m":"\u001b[31merror\u001b[0m","error":{"type":"fatal","cause":{"error":{"Code":"${code}"}}}}\u001b[0m`;
  const responses = [
    colorize("XMinioAdminNoSuchUser"),
    colorize("XMinioAdminNoSuchPolicy")
  ];
  let call = 0;
  const admin = createDockerMinioIdentityAdmin({
    inspectContainer: async () => ({ containerId: "minio", running: true }),
    execInContainer: async () => ({ stdout: responses[call++], stderr: "", exitCode: 1 })
  });

  await assert.doesNotReject(() =>
    admin.release({ bucket: "proj-old", accessKey: "old-user", policyName: "old-policy" })
  );
  assert.equal(call, 2);
});
