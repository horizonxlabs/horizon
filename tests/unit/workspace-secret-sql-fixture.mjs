import assert from "node:assert/strict";
import { createSqlSecretPersistence } from "../../apps/platform-api/src/workspace-orchestrator/secret-persistence.ts";

export function createSecretSqlFixture(runtime) {
  const rows = new Map();
  const fixture = { rows, beforeQuery: undefined, transactions: 0, persistence: undefined };
  const execute = async (sql, params = [], inTransaction = false) => {
    await fixture.beforeQuery?.(sql, params);
    const result = (items = [], rowCount = items.length) => ({ rows: items, rowCount, fields: [] });
    if (/^(CREATE|ALTER)/.test(sql.trim())) return result();
    if (sql.includes("SELECT token FROM workspace_provisioning_leases")) {
      assert.equal(inTransaction, true, "lease validation belongs to the credential transaction");
      assert.match(sql, /FOR UPDATE/);
      const lease = runtime.leases.get(params[0]);
      const matches =
        lease &&
        (!sql.includes("token = $2") || lease.token === params[1]) &&
        (!sql.includes("expires_at >") || lease.expiresAt > runtime.now);
      return result(matches ? [{ token: lease.token }] : []);
    }
    if (sql.includes("INSERT INTO project_secrets")) {
      if (params.length === 8) assert.equal(inTransaction, true);
      const [project_id, name, ciphertext, iv, auth_tag, rotated_at, created_at, token] = params;
      rows.set(`${project_id}/${name}`, {
        project_id,
        name,
        ciphertext,
        iv,
        auth_tag,
        rotated_at,
        created_at,
        provisioning_token: token ?? null
      });
      return result([], 1);
    }
    if (sql.includes("UPDATE project_secrets SET provisioning_token")) {
      assert.equal(inTransaction, true);
      for (const row of rows.values()) {
        if (row.project_id === params[0] && params[2].includes(row.name))
          row.provisioning_token = params[1];
      }
      return result();
    }
    if (sql.includes("DELETE FROM project_secrets")) {
      let count = 0;
      for (const [id, row] of rows) {
        if (
          row.project_id === params[0] &&
          (!sql.includes("provisioning_token = $2") || row.provisioning_token === params[1])
        ) {
          rows.delete(id);
          count += 1;
        }
      }
      return result([], count);
    }
    if (sql.includes("FROM project_secrets"))
      return result([...rows.values()].map((row) => structuredClone(row)));
    throw new Error(`unexpected secret query: ${sql}`);
  };
  fixture.persistence = createSqlSecretPersistence(execute, async (operation) => {
    fixture.transactions += 1;
    const before = structuredClone(rows);
    try {
      return await operation((sql, params) => execute(sql, params, true));
    } catch (error) {
      rows.clear();
      for (const [key, value] of before) rows.set(key, value);
      throw error;
    }
  });
  return fixture;
}
