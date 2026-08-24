import assert from "node:assert/strict";
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
const { WorkspaceDatabasePanel } =
  await import("../../apps/creator-web/src/features/workspace/WorkspaceDatabasePanel.tsx");

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
  { name: "content", dataType: "text", nullable: true, isPrimaryKey: false, ordinal: 2 }
];
const schema = {
  schema: "app_project_1",
  tables: [
    { name: "notes", columns },
    { name: "users", columns }
  ]
};

function tablePage(table, content) {
  return {
    table,
    columns,
    rows: [{ id: table === "notes" ? 1 : 2, content }],
    total: 1,
    limit: 100,
    offset: 0
  };
}

function json(renderer) {
  return JSON.stringify(renderer.toJSON());
}

function hostNode() {
  return {
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
  };
}

async function renderPanel(fetchImpl) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(WorkspaceDatabasePanel, { projectId: "project-1" }), {
      createNodeMock: (element) => (element.type === "div" ? hostNode() : null)
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

function findTableButton(renderer, table) {
  return renderer.root
    .findAllByType("button")
    .find((button) =>
      button
        .findAllByType("strong")
        .some((label) => label.children.some((child) => child === table))
    );
}

function hasAction(renderer, label) {
  return renderer.root
    .findAllByType("button")
    .some((button) =>
      button.children.some((child) => typeof child === "string" && child.includes(label))
    );
}

test("switching tables hides prior rows and write controls throughout loading and failure", async () => {
  const usersRequest = deferred();
  const view = await renderPanel(async (url) => {
    const path = String(url);
    if (path.endsWith("/db/schema")) return response(schema);
    if (path.endsWith("/notes")) return response(tablePage("notes", "note-a"));
    return usersRequest.promise;
  });
  try {
    assert.match(json(view.renderer), /note-a/);
    assert.equal(hasAction(view.renderer, "New row"), true);

    const usersButton = findTableButton(view.renderer, "users");
    assert.ok(usersButton);
    await act(async () => {
      usersButton.props.onClick();
      await Promise.resolve();
    });

    assert.match(json(view.renderer), /Loading records/);
    assert.doesNotMatch(json(view.renderer), /note-a/);
    assert.doesNotMatch(json(view.renderer), /1 rows/);
    assert.equal(hasAction(view.renderer, "New row"), false);
    assert.equal(hasAction(view.renderer, "Delete ("), false);

    await act(async () => {
      usersRequest.resolve(
        response(undefined, { ok: false, status: 503, message: "users table offline" })
      );
      await usersRequest.promise;
      await Promise.resolve();
    });

    assert.match(json(view.renderer), /Database could not be loaded/);
    assert.match(json(view.renderer), /users table offline/);
    assert.doesNotMatch(json(view.renderer), /note-a/);
    assert.equal(hasAction(view.renderer, "New row"), false);
    assert.equal(hasAction(view.renderer, "Delete ("), false);
  } finally {
    await view.cleanup();
  }
});

test("a late prior-table success cannot replace the current table rows", async () => {
  const notesRequest = deferred();
  const view = await renderPanel(async (url) => {
    const path = String(url);
    if (path.endsWith("/db/schema")) return response(schema);
    if (path.endsWith("/notes")) return notesRequest.promise;
    return response(tablePage("users", "user-b"));
  });
  try {
    const usersButton = findTableButton(view.renderer, "users");
    assert.ok(usersButton);
    await act(async () => {
      usersButton.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.match(json(view.renderer), /user-b/);

    await act(async () => {
      notesRequest.resolve(response(tablePage("notes", "note-late")));
      await notesRequest.promise;
      await Promise.resolve();
    });

    assert.match(json(view.renderer), /user-b/);
    assert.doesNotMatch(json(view.renderer), /note-late/);
    assert.doesNotMatch(json(view.renderer), /Database could not be loaded/);
  } finally {
    await view.cleanup();
  }
});

test("a late prior-table failure cannot replace the current table rows", async () => {
  const notesRequest = deferred();
  const view = await renderPanel(async (url) => {
    const path = String(url);
    if (path.endsWith("/db/schema")) return response(schema);
    if (path.endsWith("/notes")) return notesRequest.promise;
    return response(tablePage("users", "user-current"));
  });
  try {
    const usersButton = findTableButton(view.renderer, "users");
    assert.ok(usersButton);
    await act(async () => {
      usersButton.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.match(json(view.renderer), /user-current/);

    await act(async () => {
      notesRequest.resolve(
        response(undefined, { ok: false, status: 502, message: "late notes failure" })
      );
      await notesRequest.promise;
      await Promise.resolve();
    });

    assert.match(json(view.renderer), /user-current/);
    assert.doesNotMatch(json(view.renderer), /late notes failure/);
    assert.doesNotMatch(json(view.renderer), /Database could not be loaded/);
  } finally {
    await view.cleanup();
  }
});
