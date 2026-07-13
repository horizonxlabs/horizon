import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");

test("platform auth sessions retain rotation and revocation state in PostgreSQL", () => {
  const model = schema.match(/model PlatformAuthSession \{([\s\S]*?)\n\}/)?.[1] ?? "";

  for (const field of [
    "sessionFamilyId",
    "accessTokenId",
    "refreshTokenHash",
    "refreshExpiresAt",
    "lastUsedAt",
    "revokedAt",
    "revokeReason",
    "replacedBySessionId"
  ]) {
    assert.match(model, new RegExp(`\\b${field}\\b`));
  }
});
