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

const localStorageValues = new Map();
const localStorageStub = {
  getItem: (key) => localStorageValues.get(key) ?? null,
  setItem: (key, value) => localStorageValues.set(key, value),
  removeItem: (key) => localStorageValues.delete(key)
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
const main = await import("node:fs/promises").then((fs) =>
  fs.readFile("apps/creator-web/src/main.tsx", "utf8")
);
const routes = await import("node:fs/promises").then((fs) =>
  fs.readFile("apps/creator-web/src/routes/CreatorRoutes.tsx", "utf8")
);
assert.match(main, /@\/app\/CreatorApp/);
assert.match(routes, /@\/features\/projects/);
assert.doesNotMatch(main, /function CreatorAuthGate/);

const { useCreatorApp } = await import(`${base}/app/use-creator-app.tsx`);
const { CreatorApp } = await import(`${base}/app/CreatorApp.tsx`);
const { CreatorRoutes } = await import(`${base}/routes/CreatorRoutes.tsx`);
const { ProjectsPage } = await import(`${base}/features/projects`);
const { WorkspacePage } = await import(`${base}/features/workspace`);
const { PrdPage } = await import(`${base}/features/prd`);
const { UsersPage } = await import(`${base}/features/users`);
const { PublishPage } = await import(`${base}/features/publish`);
const { TicketsPage } = await import(`${base}/features/tickets`);
const { DefaultPage } = await import(`${base}/features/default-dashboard`);

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

test("CreatorApp composes the login auth gate when no Creator session exists", () => {
  localStorageValues.clear();
  const html = renderToStaticMarkup(React.createElement(CreatorApp));
  assert.match(html, /creator-auth-screen/);
  assert.doesNotMatch(html, /Workspace view/);
});

test("CreatorApp composes CreatorRoutes after a valid Creator session", () => {
  localStorageValues.set("evcp_session", "creator-session");
  localStorageValues.set("evcp_session_expires_at", new Date(Date.now() + 60_000).toISOString());
  window.location.pathname = "/creator/projects/project-1";
  const html = renderToStaticMarkup(React.createElement(CreatorApp));
  assert.match(html, /Loading Creator projects from Platform API/);
  localStorageValues.clear();
});

const ROUTE_CASES = [
  ["projects", "/creator", /รายการโปรเจกต์/],
  ["workspace", "/creator/projects/project-1", /Workspace view/],
  ["prd", "/creator/projects/project-1/prd", /Structured PRD Sections/],
  ["users", "/creator/projects/project-1/users", /App users roles/],
  ["publish", "/creator/projects/project-1/publish", /Publish app/],
  ["tickets", "/creator/projects/project-1/tickets", /Tickets and PRD changes/]
];

for (const [page, pathname, expected] of ROUTE_CASES) {
  test(`CreatorRoutes maps ${page} to its capability screen`, () => {
    window.location.pathname = pathname;
    const html = renderWithHook((app) =>
      React.createElement(CreatorRoutes, { app: { ...app, bootstrap: { ...app.bootstrap, status: "ready" } } })
    );
    assert.match(html, expected);
  });
}

test("CreatorRoutes fail-closes the default dashboard route without demo records", () => {
  const html = renderWithHook((app) =>
    React.createElement(CreatorRoutes, {
      app: { ...app, creatorPage: "unexpected", bootstrap: { ...app.bootstrap, status: "ready" } }
    })
  );
  assert.match(html, /This route has no dashboard fallback/);
  assert.doesNotMatch(html, /Database and frontend versions/);
  assert.doesNotMatch(html, /TKT-0001/);
});

test("CreatorRoutes keeps the first-project state inside the shared Creator shell", () => {
  const html = renderWithHook((app) =>
    React.createElement(CreatorRoutes, {
      app: { ...app, bootstrap: { ...app.bootstrap, status: "empty" } }
    })
  );
  // Light tone is applied to the shared shell (utilities replaced the legacy app-shell-light class).
  assert.match(html, /<aside[^>]*bg-surface text-body/);
  assert.match(html, /เริ่มสร้างแอปภายในองค์กร/);
  assert.match(html, /สร้าง Project ใหม่/);
});

for (const [name, Page] of Object.entries(PAGES)) {
  test(`${name} renders without throwing (real hook state)`, () => {
    const html = renderWithHook((app) => React.createElement(Page, { app }));
    assert.equal(typeof html, "string");
  });
}

test("ProjectsPage renders the create-first landing inside the shared Creator shell", () => {
  const html = renderWithHook((app) => React.createElement(ProjectsPage, { app }));

  assert.match(html, /class="[^"]*hz-projects-studio/);
  // Shared AppShell chrome, restyled onto token utilities but structurally unchanged:
  // light tone, mobile open/close controls (by aria), backdrop, and the sidebar aside id.
  assert.match(html, /<aside[^>]*bg-surface text-body/);
  assert.match(html, /aria-expanded="false" aria-controls="app-shell-sidebar-[^"]+" aria-label="Open navigation"/);
  assert.match(html, /aria-controls="app-shell-sidebar-[^"]+"/);
  assert.match(html, /aria-label="Close navigation" aria-hidden="true" tabindex="-1"/);
  assert.match(html, /aria-label="Close navigation"><span aria-hidden="true">×/);
  assert.match(html, /<aside[^>]*id="app-shell-sidebar-[^"]+"/);
  assert.match(html, /เริ่มสร้างแอปภายในองค์กร/);
  assert.match(html, /สร้าง Project ใหม่/);
  assert.match(html, /โปรเจกต์ล่าสุด/);
  assert.match(html, /aria-label="ค้นหาโปรเจกต์"/);
  assert.match(html, /aria-label="รายการโปรเจกต์"/);
  assert.doesNotMatch(html, /Updated \d|อัปเดตเมื่อ/);
});

test("ProjectsPage is create-first: shows the create CTA and no free-text prompt box", () => {
  const html = renderWithHook((app) => React.createElement(ProjectsPage, { app }));
  assert.match(html, /สร้าง Project ใหม่/);
  assert.doesNotMatch(html, /อธิบายแอปที่ต้องการสร้าง/);
});

test("ProjectsPage CTA and search use @evcp/ui primitives", () => {
  const html = renderWithHook((app) => React.createElement(ProjectsPage, { app }));
  assert.match(html, /aria-label="ค้นหาโปรเจกต์"[^>]*focus:ring-primary-soft|focus:ring-primary-soft[^>]*aria-label="ค้นหาโปรเจกต์"/);
  assert.match(html, /สร้าง Project ใหม่/);
  assert.doesNotMatch(html, /hz-prompt-cta/);
});

test("PrdPage Confirm Baseline uses the @evcp/ui Button primitive (classed, not a raw button)", () => {
  const html = renderWithHook((app) => React.createElement(PrdPage, { app }));
  assert.match(html, /<button[^>]*class="[^"]+"[^>]*>Confirm Baseline<\/button>/);
});

test("WorkspacePage tabs + header controls use @evcp/ui primitives", () => {
  window.location.pathname = "/creator/projects/project-1";
  const html = renderWithHook((app) =>
    React.createElement(WorkspacePage, { app: { ...app, bootstrap: { ...app.bootstrap, status: "ready" } } })
  );
  assert.doesNotMatch(html, /class="vibe-live-tab /);
  assert.doesNotMatch(html, /class="[^"]*vibe-live-icon-btn/);
  assert.match(html, /Publish<\/button>/);
});

test("WorkspacePage composer uses primitive Textarea + Button (no raw send/input)", () => {
  window.location.pathname = "/creator/projects/project-1";
  const html = renderWithHook((app) =>
    React.createElement(WorkspacePage, { app: { ...app, bootstrap: { ...app.bootstrap, status: "ready" } } })
  );
  assert.doesNotMatch(html, /class="vibe-live-send"/);
  assert.doesNotMatch(html, /class="vibe-live-input"/);
});

test("WorkspaceCodePanel renders on primitives without throwing", () => {
  window.location.pathname = "/creator/projects/project-1";
  const html = renderWithHook((app) =>
    React.createElement(WorkspacePage, { app: { ...app, vibeTab: "code", bootstrap: { ...app.bootstrap, status: "ready" } } })
  );
  assert.equal(typeof html, "string");
});
