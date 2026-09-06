import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("startup seed never overwrites administrator AI providers, credentials, or routes", async () => {
  const source = await readFile(
    new URL("../../apps/platform-api/prisma/seed.ts", import.meta.url),
    "utf8"
  );
  const governance = source.slice(
    source.indexOf('where: { id: "aip_openai_production" }'),
    source.indexOf("await seedImageGeneration(prisma);")
  );

  assert.match(governance, /where: \{ id: "aip_openai_production" \},\s*update: \{\}/);
  assert.match(governance, /where: \{ id: "aik_openai_primary" \},\s*update: \{\}/);
  assert.match(governance, /where: \{ scenario \},\s*update: \{\}/);
  assert.doesNotMatch(governance, /update:\s*\{[^}]*secretCiphertext/s);
});
