import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production documentation and compose configuration require real Keycloak SSO", async () => {
  const docs = await Promise.all(
    [
      "docs/operations/real-mvp-auth-session.md",
      "docs/operations/real-mvp-frontend-api-bootstrap.md",
      "docs/operations/real-mvp-install.md"
    ].map((file) => readFile(file, "utf8"))
  );

  for (const source of docs) {
    assert.doesNotMatch(source, /Replace simulated SSO login|not the final Keycloak\/OIDC browser callback/);
  }
  assert.match(docs.join("\n"), /Authorization Code.*PKCE/);
});
