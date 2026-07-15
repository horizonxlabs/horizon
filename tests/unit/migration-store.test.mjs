import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryMigrationStore } from "../../apps/platform-api/src/generation-loop/migration-store.ts";

test("memory migration evidence batch leaves no partial records when the second input fails", async () => {
  const store = createMemoryMigrationStore();
  const broken = {
    projectId: "p1",
    get name() {
      throw new Error("second evidence record failed");
    },
    sql: "CREATE TABLE second(id text)",
    commitSha: "deadbeef"
  };

  await assert.rejects(
    () =>
      store.recordMigrations([
        {
          projectId: "p1",
          name: "first",
          sql: "CREATE TABLE first(id text)",
          commitSha: "deadbeef"
        },
        broken
      ]),
    /second evidence record failed/
  );
  assert.deepEqual(await store.listMigrations("p1"), []);
});
