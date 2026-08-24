import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window ??= {
  location: { pathname: "/creator", search: "", hash: "", href: "http://localhost", port: "" },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
};
globalThis.document ??= {
  addEventListener() {},
  removeEventListener() {},
  documentElement: { dir: "ltr" }
};
globalThis.CSS ??= { escape: (value) => String(value) };

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { renderToStaticMarkup } = await import("react-dom/server");
const { WorkspaceDatabasePanel } = await import(
  "../../apps/creator-web/src/features/workspace/WorkspaceDatabasePanel.tsx"
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function response(data, { ok = true, status = 200, message } = {}) {
  return {
    ok,
    status,
    json: async () => (ok ? { ok: true, data } : { ok: false, error: { message } })
  };
}

const columns = [
  { name: "id", dataType: "integer", nullable: false, isPrimaryKey: true, ordinal: 1 },
  { name: "content", dataType: "text", nullable: true, isPrimaryKey: false, ordinal: 2 },
  { name: "createdAt", dataType: "timestamp", nullable: false, isPrimaryKey: false, ordinal: 3 }
];
const schema = { schema: "app_project_1", tables: [{ name: "notes", columns }] };

function json(renderer) {
  return JSON.stringify(renderer.toJSON());
}

async function renderPanel(fetchImpl) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspaceDatabasePanel, { projectId: "project-1" }), {
      createNodeMock: (element) =>
        element.type === "div"
          ? {
              clientHeight: 480,
              clientWidth: 960,
              addEventListener() {},
              removeEventListener() {},
              focus() {},
              scrollHeight: 480,
              scrollLeft: 0,
              scrollTop: 0,
              scrollWidth: 960,
              querySelector: () => null
            }
          : null
    });
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    renderer,
    async cleanup() {
      await act(async () => renderer.unmount());
      if (originalFetch === undefined) delete globalThis.fetch;
      else globalThis.fetch = originalFetch;
    }
  };
}

test("database formatter preserves plain strings and renders readable scalar values", async () => {
  const { formatDatabaseValue } = await import(
    "../../apps/creator-web/src/features/workspace/format-database-value.tsx"
  );

  assert.equal(formatDatabaseValue(null), "Not set");
  assert.equal(formatDatabaseValue(undefined), "Not set");
  assert.equal(formatDatabaseValue(""), "Not set");
  assert.equal(formatDatabaseValue(true), "Yes");
  assert.equal(formatDatabaseValue(false), "No");
  assert.equal(formatDatabaseValue(1234567), "1,234,567");
  assert.equal(formatDatabaseValue("flex gap-4 text-red-500"), "flex gap-4 text-red-500");
  assert.equal(formatDatabaseValue("2026-99-99T25:61:00Z"), "2026-99-99T25:61:00Z");

  const dateMarkup = renderToStaticMarkup(
    React.createElement(React.Fragment, null, formatDatabaseValue("2026-08-24T12:30:00.000Z"))
  );
  assert.match(dateMarkup, /Aug/);
  assert.match(dateMarkup, /2026/);

  const objectMarkup = renderToStaticMarkup(
    React.createElement(React.Fragment, null, formatDatabaseValue({ stage: "ready", count: 2 }))
  );
  assert.match(objectMarkup, /^<code(?:\s|>)/);
  assert.match(objectMarkup, /&quot;stage&quot;:&quot;ready&quot;/);
});

test("database schema loading is announced as one semantic state", async () => {
  const pending = deferred();
  const view = await renderPanel(() => pending.promise);
  try {
    assert.match(json(view.renderer), /creator-state-loading/);
    assert.match(json(view.renderer), /Loading database schema/);
    assert.equal(view.renderer.root.findAll((node) => node.props.role === "status").length, 1);
  } finally {
    await view.cleanup();
  }
});

test("database schema failure exposes technical details and recovers through Retry", async () => {
  let calls = 0;
  const view = await renderPanel(async () => {
    calls += 1;
    return calls === 1
      ? response(undefined, { ok: false, status: 503, message: "schema API offline" })
      : response({ schema: "app_project_1", tables: [] });
  });
  try {
    assert.match(json(view.renderer), /creator-state-unavailable/);
    assert.match(json(view.renderer), /Database could not be loaded/);
    assert.match(json(view.renderer), /Technical details/);
    assert.match(json(view.renderer), /schema API offline/);
    assert.doesNotMatch(json(view.renderer), /Couldn.t load schema:/);

    const retry = view.renderer.root
      .findAllByType("button")
      .find((button) => button.children.join("") === "Retry");
    assert.ok(retry);
    await act(async () => {
      await retry.props.onClick();
      await Promise.resolve();
    });
    assert.equal(calls, 2);
    assert.match(json(view.renderer), /No tables yet/);
  } finally {
    await view.cleanup();
  }
});

test("database record loading and healthy empty records are distinct states", async () => {
  const tablePage = deferred();
  const view = await renderPanel(async (url) =>
    String(url).endsWith("/db/schema") ? response(schema) : tablePage.promise
  );
  try {
    assert.match(json(view.renderer), /Loading records/);
    assert.doesNotMatch(json(view.renderer), /No records yet/);

    await act(async () => {
      tablePage.resolve(response({ table: "notes", columns, rows: [], total: 0, limit: 100, offset: 0 }));
      await tablePage.promise;
      await Promise.resolve();
    });
    assert.match(json(view.renderer), /creator-state-empty/);
    assert.match(json(view.renderer), /No records yet/);
  } finally {
    await view.cleanup();
  }
});

test("record load failure retries without changing the selected table", async () => {
  let tableCalls = 0;
  const view = await renderPanel(async (url) => {
    if (String(url).endsWith("/db/schema")) return response(schema);
    tableCalls += 1;
    return tableCalls === 1
      ? response(undefined, { ok: false, status: 502, message: "rows API offline" })
      : response({ table: "notes", columns, rows: [], total: 0, limit: 100, offset: 0 });
  });
  try {
    assert.match(json(view.renderer), /Database could not be loaded/);
    assert.match(json(view.renderer), /rows API offline/);
    const retry = view.renderer.root
      .findAllByType("button")
      .find((button) => button.children.join("") === "Retry");
    assert.ok(retry);
    await act(async () => {
      await retry.props.onClick();
      await Promise.resolve();
    });
    assert.equal(tableCalls, 2);
    assert.match(json(view.renderer), /No records yet/);
    assert.match(json(view.renderer), /notes/);
  } finally {
    await view.cleanup();
  }
});

test("populated database keeps raw edit values while formatting display-only cells", async () => {
  const rawCssText = "flex gap-4 text-red-500";
  const rows = [
    { id: 1234567, content: rawCssText, createdAt: "2026-08-24T12:30:00.000Z" }
  ];
  const view = await renderPanel(async (url) =>
    String(url).endsWith("/db/schema")
      ? response(schema)
      : response({ table: "notes", columns, rows, total: 1, limit: 100, offset: 0 })
  );
  try {
    const grid = view.renderer.root.find(
      (node) => node.props.className?.includes?.("hz-db-rdg") && Array.isArray(node.props.rows)
    );
    assert.deepEqual(grid.props.rows, rows);

    const contentColumn = grid.props.columns.find((column) => column.key === "content");
    const display = contentColumn.renderCell({ row: rows[0] });
    assert.equal(display, rawCssText);
    const editor = contentColumn.renderEditCell({
      row: rows[0],
      column: contentColumn,
      onRowChange() {},
      onClose() {}
    });
    assert.equal(editor.props.value, rawCssText);

    const idColumn = grid.props.columns.find((column) => column.key === "id");
    assert.equal(idColumn.renderCell({ row: rows[0] }), "1,234,567");

    const overflow = view.renderer.root.find(
      (node) => node.props.className === "hz-db-scroll"
    );
    assert.equal(overflow.props.role, "region");
    assert.equal(overflow.props["aria-label"], "Records in notes");
    assert.equal(overflow.props.tabIndex, 0);

    const tableStrip = view.renderer.root.find(
      (node) => node.props.className === "hz-db-tables"
    );
    assert.equal(tableStrip.props.role, "region");
    assert.equal(tableStrip.props["aria-label"], "Database tables");
    assert.equal(tableStrip.props.tabIndex, 0);
    const selectedTable = view.renderer.root.find(
      (node) => node.type === "button" && node.props["aria-pressed"] === true
    );
    assert.equal(selectedTable.props["aria-pressed"], true);
  } finally {
    await view.cleanup();
  }
});

test("a failed row update keeps existing records visible and reports technical details", async () => {
  const rows = [{ id: 1, content: "Original", createdAt: "2026-08-24T12:30:00.000Z" }];
  const view = await renderPanel(async (url, init) => {
    if (String(url).endsWith("/db/schema")) return response(schema);
    if (init?.method === "POST") {
      return response(undefined, { ok: false, status: 409, message: "write conflict" });
    }
    return response({ table: "notes", columns, rows, total: 1, limit: 100, offset: 0 });
  });
  try {
    const grid = view.renderer.root.find(
      (node) => node.props.className?.includes?.("hz-db-rdg") && Array.isArray(node.props.rows)
    );
    await act(async () => {
      grid.props.onRowsChange(
        [{ ...rows[0], content: "Changed" }],
        { indexes: [0], column: { key: "content" } }
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.match(json(view.renderer), /Write failed/);
    assert.match(json(view.renderer), /Technical details/);
    assert.match(json(view.renderer), /write conflict/);
    assert.ok(
      view.renderer.root.findAll(
        (node) => node.props.className?.includes?.("hz-db-rdg") && Array.isArray(node.props.rows)
      ).length > 0
    );
  } finally {
    await view.cleanup();
  }
});

test("database responsive contract keeps the table strip and record region reachable", async () => {
  const css = await readFile("packages/ui/styles.css", "utf8");
  const databaseStylesStart = css.indexOf("/* --- Workspace Database tab");
  const narrowStylesStart = css.indexOf("@media (max-width: 760px)", databaseStylesStart);
  const narrowDatabaseRules =
    narrowStylesStart >= 0 ? css.slice(narrowStylesStart, narrowStylesStart + 1800) : undefined;
  assert.ok(narrowDatabaseRules, "expected narrow database rules under the 760px breakpoint");
  assert.match(narrowDatabaseRules, /grid-template-columns:\s*1fr/);
  assert.match(narrowDatabaseRules, /\.hz-db-tables \{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.hz-db-rdg \.rdg-header-row \{[\s\S]*?position:\s*sticky/);
  assert.match(css, /\.hz-db-table-item:focus-visible/);
});
