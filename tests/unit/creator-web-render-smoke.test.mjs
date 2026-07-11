import test from "node:test";
import assert from "node:assert/strict";

// Render-smoke harness for creator-web.
//
// tsc and `vite build` both PASS on code that crashes at render time — e.g. a dropped
// `import { appMembers }` surfaces only as a runtime `ReferenceError: appMembers is not defined`
// once React actually renders the component. A prior refactor shipped exactly that class of bug
// past the static checks; the only thing that caught it was opening a browser. This harness closes
// that gap: it renders the real `useCreatorApp` hook and every page component via
// `renderToStaticMarkup`, so any bare-undefined reference or render-time throw fails a test.
//
// We stub the browser globals the render path reads (window/localStorage/document/fetch) BEFORE
// importing the app modules. Effects do not run under static rendering, so no network happens.

const localStorageStub = {
  getItem: () => null,
  setItem() {},
  removeItem() {}
};
globalThis.localStorage ??= localStorageStub;
globalThis.window ??= {
  location: { pathname: "/creator", search: "", href: "http://localhost/creator", hash: "" },
  history: { pushState() {}, replaceState() {} },
  localStorage: localStorageStub,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.document ??= {
  getElementById: () => null,
  createElement: () => ({ style: {} }),
  addEventListener() {},
  removeEventListener() {}
};
globalThis.fetch ??= async () => ({
  ok: false,
  status: 401,
  json: async () => ({}),
  text: async () => ""
});

const React = (await import("react")).default;
// The creator-web components use the automatic JSX runtime (no `import React`), but tsx compiles
// their JSX to classic `React.createElement`. Expose React globally so that resolves under the
// test runtime without editing every component.
globalThis.React = React;
const { renderToStaticMarkup } = await import("react-dom/server");

const base = "../../apps/creator-web/src";
const { useCreatorApp } = await import(`${base}/hooks/use-creator-app.tsx`);
const { ProjectsPage } = await import(`${base}/pages/ProjectsPage.tsx`);
const { WorkspacePage } = await import(`${base}/pages/WorkspacePage.tsx`);
const { PrdPage } = await import(`${base}/pages/PrdPage.tsx`);
const { UsersPage } = await import(`${base}/pages/UsersPage.tsx`);
const { PublishPage } = await import(`${base}/pages/PublishPage.tsx`);
const { TicketsPage } = await import(`${base}/pages/TicketsPage.tsx`);
const { DefaultPage } = await import(`${base}/pages/DefaultPage.tsx`);

const PAGES = {
  ProjectsPage,
  WorkspacePage,
  PrdPage,
  UsersPage,
  PublishPage,
  TicketsPage,
  DefaultPage
};

// Render a probe that calls the real hook and hands its result to `render(app)`.
function renderWithHook(render) {
  function Probe() {
    const app = useCreatorApp({});
    return render(app);
  }
  return renderToStaticMarkup(React.createElement(Probe));
}

test("useCreatorApp renders without a ReferenceError (catches dropped imports/refs in the hook)", () => {
  assert.doesNotThrow(() =>
    renderWithHook((app) => React.createElement("div", null, String(app.creatorPage ?? "?")))
  );
});

for (const [name, Page] of Object.entries(PAGES)) {
  test(`${name} renders without throwing (real hook state)`, () => {
    const html = renderWithHook((app) => React.createElement(Page, { app }));
    assert.equal(typeof html, "string");
  });
}

test("ProjectsPage renders the B1 AI studio inside the shared Creator shell", () => {
  const html = renderWithHook((app) => React.createElement(ProjectsPage, { app }));

  assert.match(html, /class="[^"]*hz-projects-studio/);
  assert.match(html, /class="[^"]*app-shell-light/);
  assert.match(html, /class="app-shell-mobile-trigger"[^>]*aria-expanded="false"/);
  assert.match(html, /aria-controls="app-shell-sidebar-[^"]+"/);
  assert.match(html, /class="app-shell-mobile-backdrop"/);
  assert.match(html, /class="sidebar-mobile-close"/);
  assert.match(html, /<aside[^>]*id="app-shell-sidebar-[^"]+"/);
  assert.match(html, /วันนี้อยากสร้างอะไร/);
  assert.match(html, /สร้างด้วย AI/);
  assert.match(html, /โปรเจกต์ล่าสุด/);
  assert.match(html, /aria-label="ค้นหาโปรเจกต์"/);
  assert.match(html, /aria-label="รายการโปรเจกต์"/);
  assert.doesNotMatch(html, /Updated \d|อัปเดตเมื่อ/);
});
