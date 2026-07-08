import test from "node:test";
import assert from "node:assert/strict";
import { createPgRunSql, Client } from "../../apps/platform-api/src/workspace-orchestrator/pg-runner.ts";
import { createPgClientPostgresProvisioner, schemaNameFor } from "../../apps/platform-api/src/workspace-orchestrator/postgres-provisioner.ts";

const LIVE = process.env.EVCP_PG_LIVE === "1";

function pgConfig() {
  return {
    host: process.env.EVCP_PG_HOST ?? "postgres",
    port: Number(process.env.EVCP_PG_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? "evcp",
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB ?? "evcp"
  };
}

test("provisionSchema creates a real schema + role, releaseSchema removes it", { skip: !LIVE }, async () => {
  const slug = "livetest" + Math.floor(Number(process.env.EVCP_TEST_SEED ?? "1"));
  const runSql = createPgRunSql(pgConfig());
  const provisioner = createPgClientPostgresProvisioner(runSql);

  await provisioner.provisionSchema(slug);
  const schema = schemaNameFor(slug);

  const admin = new Client(pgConfig());
  await admin.connect();
  try {
    const found = await admin.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
      [schema]
    );
    assert.equal(found.rowCount, 1, "expected the provisioned schema to exist");

    await provisioner.releaseSchema(slug);
    const gone = await admin.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
      [schema]
    );
    assert.equal(gone.rowCount, 0, "expected the schema to be dropped after release");
  } finally {
    await admin.end();
  }
});
