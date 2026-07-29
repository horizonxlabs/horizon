import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadEnvFile } from "../../scripts/install/preflight.mjs";

test("README quick start matches the checked-in local ports and automatic env setup", () => {
  const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  const env = loadEnvFile(fileURLToPath(new URL("../../.env.example", import.meta.url)));

  assert.match(readme, /creates a local `\.env` with generated development secrets/i);
  assert.match(readme, new RegExp(`http://localhost:${env.EVCP_HTTP_PORT}/admin`));
  assert.match(readme, new RegExp(`http://localhost:${env.EVCP_API_PORT}`));
  assert.match(readme, new RegExp(`http://localhost:${env.EVCP_KEYCLOAK_HOST_PORT}/auth`));
  assert.match(readme, new RegExp(`http://localhost:${env.EVCP_S3_CONSOLE_HOST_PORT}`));
});
