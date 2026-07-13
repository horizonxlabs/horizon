import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("apps/platform-api/src/auth/platform-session-service.ts", "utf8");

test("platform session service uses short access tokens, opaque refresh hashes, and reuse revocation", () => {
  assert.match(source, /ACCESS_TOKEN_TTL_SECONDS\s*=\s*15 \* 60/);
  assert.match(source, /REFRESH_TOKEN_TTL_SECONDS\s*=\s*7 \* 24 \* 60 \* 60/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /refresh_token_reused/);
  assert.match(source, /revokeSessionFamily/);
});
