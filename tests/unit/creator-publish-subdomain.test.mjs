import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;
const originalWindow = globalThis.window;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
globalThis.window = {
  location: { pathname: "/creator/projects/release_plan_2026/publish" },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {}
};

const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { PlatformApiError } = await import("@evcp/api-client");
const { PublishAccessUrlCard } =
  await import("../../apps/creator-web/src/features/publish/PublishAccessUrlCard.tsx");
const { PublishPage } = await import("../../apps/creator-web/src/features/publish/PublishPage.tsx");
const { usePublishAccess } =
  await import("../../apps/creator-web/src/features/publish/use-publish-access.ts");

const manifest = {
  appId: "app-1",
  manifestVersion: "3",
  app: { slug: "release-plan-2026", route: "/apps/release-plan-2026" },
  frontend: { checkpointId: "cp-3", version: "3", checksum: "sha", routes: ["/"] },
  auth: { mode: "platform_auth_sdk", accessMode: "restricted" },
  roles: [{ key: "owner", name: "Owner", permissions: ["manage"] }]
};

const project = {
  id: "release_plan_2026",
  name: "สวัสดี",
  appType: "Workflow App",
  status: "active",
  owner: "Creator",
  prdVersion: "1",
  frontendVersion: "3",
  tokenUsedThisMonth: 0
};

function review() {
  return {
    manifest,
    checklist: [],
    ready: true,
    accessUrlConfig: { baseDomain: "apps.example.test", secure: true }
  };
}

function pageApp(overrides = {}) {
  const selectedProject = overrides.selectedProject ?? project;
  return {
    creatorNavItems: [],
    bootstrap: {
      projects: [selectedProject],
      selectedProject,
      userName: "Creator",
      status: "ready"
    },
    creatorSessionControls: null,
    creatorPage: "publish",
    pageCopy: { title: "Publish & Registry", description: "Review readiness." },
    selectedProject,
    creatorPageActions: null,
    isCreateProjectDialogOpen: false,
    setIsCreateProjectDialogOpen() {},
    isEnteringWorkspace: false,
    onNavigate() {},
    pathname: `/creator/projects/${selectedProject.id}/publish`,
    handlePublishProject() {},
    clearPublishSubdomainError() {},
    publishSubdomainError: undefined,
    isPublishingProject: false,
    accessLoadState: "ready",
    publishReadinessState: "ready",
    publishReview: review(),
    publishResult: undefined,
    visibleRegistryEntry: undefined,
    visiblePublishChecklist: [],
    visibleDeployment: undefined,
    visiblePreview: { id: "preview-3", version: "3" },
    publishMessage: "Publish readiness is up to date.",
    publishMessageTone: "success",
    publishMessageTechnicalDetails: undefined,
    refreshCreatorPublishState: async () => undefined,
    ...overrides
  };
}

function textOf(node) {
  return node.children.filter((child) => typeof child === "string").join("");
}

function subdomainInput(renderer) {
  return renderer.root.find(
    (node) => node.type === "input" && node.props.id === "creator-publish-subdomain"
  );
}

function publishButton(renderer) {
  return renderer.root.find(
    (node) => node.type === "button" && textOf(node).includes("Publish to App Store")
  );
}

test("PublishAccessUrlCard exposes one selected platform option and disabled custom DNS", () => {
  const html = renderToStaticMarkup(
    React.createElement(PublishAccessUrlCard, {
      value: "people-ops",
      previewUrl: "https://people-ops.apps.example.test",
      error: "This subdomain is reserved.",
      onChange() {}
    })
  );

  assert.match(html, /Access URL/);
  assert.match(html, /type="radio"[^>]*checked/);
  assert.match(html, /Platform subdomain/);
  assert.match(html, /for="creator-publish-subdomain"/);
  assert.match(
    html,
    /aria-describedby="creator-publish-subdomain-hint creator-publish-subdomain-error"/
  );
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /<output[^>]*>https:\/\/people-ops\.apps\.example\.test<\/output>/);
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.match(html, /Custom domain/);
  assert.match(html, /Coming soon/);
});

test("PublishPage initializes from the project fallback and resets only when project ID changes", async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PublishPage, { app: pageApp() }));
  });
  assert.equal(subdomainInput(renderer).props.value, "release-plan-2026");
  assert.match(
    JSON.stringify(renderer.toJSON()),
    /https:\/\/release-plan-2026\.apps\.example\.test/
  );

  await act(async () => subdomainInput(renderer).props.onChange({ target: { value: "team-hub" } }));
  await act(async () => {
    renderer.update(
      React.createElement(PublishPage, {
        app: pageApp({ selectedProject: { ...project, name: "Renamed project" } })
      })
    );
  });
  assert.equal(subdomainInput(renderer).props.value, "team-hub");

  const nextProject = { ...project, id: "sales_portal", name: "Sales Portal" };
  await act(async () => {
    renderer.update(
      React.createElement(PublishPage, {
        app: pageApp({ selectedProject: nextProject })
      })
    );
  });
  assert.equal(subdomainInput(renderer).props.value, "sales-portal");
  await act(async () => renderer.unmount());
});

test("PublishPage renders the access URL before readiness and blocks invalid labels", async () => {
  const calls = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(PublishPage, {
        app: pageApp({ handlePublishProject: async (input) => calls.push(input) })
      })
    );
  });

  const initialJson = JSON.stringify(renderer.toJSON());
  assert.ok(initialJson.indexOf("Access URL") < initialJson.indexOf("Publish readiness"));

  await act(async () => subdomainInput(renderer).props.onChange({ target: { value: "ab" } }));
  assert.equal(subdomainInput(renderer).props["aria-invalid"], true);
  assert.match(JSON.stringify(renderer.toJSON()), /3-63 lowercase letters/);
  assert.equal(publishButton(renderer).props.disabled, true);

  await act(async () => subdomainInput(renderer).props.onChange({ target: { value: "admin" } }));
  assert.match(JSON.stringify(renderer.toJSON()), /This subdomain is reserved/);
  assert.equal(publishButton(renderer).props.disabled, true);

  await act(async () => subdomainInput(renderer).props.onChange({ target: { value: "team-hub" } }));
  assert.equal(subdomainInput(renderer).props["aria-invalid"], undefined);
  assert.equal(publishButton(renderer).props.disabled, false);
  await act(async () => publishButton(renderer).props.onClick());
  assert.deepEqual(calls, [{ subdomain: "team-hub" }]);
  await act(async () => renderer.unmount());
});

let latestPublish;
function HookPage({ client, selectedProject = project }) {
  latestPublish = usePublishAccess({
    selectedProject,
    clientFactory: () => client,
    loadAccessState: async () => ({ members: [], invitations: [], accessRequests: [], roles: [] }),
    loadPublishState: async () => ({ review: review(), registry: [], deployments: [] })
  });
  return React.createElement(PublishPage, {
    app: pageApp({ ...latestPublish, selectedProject })
  });
}

for (const serverFailure of [
  { code: "SUBDOMAIN_INVALID", status: 400, message: "Subdomain is not valid." },
  { code: "SUBDOMAIN_TAKEN", status: 409, message: "Subdomain is already in use." }
]) {
  test(`${serverFailure.status} ${serverFailure.code} blocks retry until the subdomain changes`, async () => {
    let focusCount = 0;
    const client = {
      publishProject: async () => {
        throw new PlatformApiError(serverFailure);
      }
    };
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(HookPage, { client }), {
        createNodeMock(element) {
          return element.type === "input" && element.props.id === "creator-publish-subdomain"
            ? {
                focus() {
                  focusCount += 1;
                }
              }
            : {};
        }
      });
    });
    await act(async () => latestPublish.refreshCreatorPublishState(project.id));
    await act(async () =>
      subdomainInput(renderer).props.onChange({ target: { value: "team-hub" } })
    );
    await act(async () => publishButton(renderer).props.onClick());

    assert.equal(subdomainInput(renderer).props.value, "team-hub");
    assert.equal(subdomainInput(renderer).props["aria-invalid"], true);
    assert.match(JSON.stringify(renderer.toJSON()), new RegExp(serverFailure.message));
    assert.equal(focusCount, 1);
    assert.equal(publishButton(renderer).props.disabled, true);

    await act(async () =>
      subdomainInput(renderer).props.onChange({ target: { value: "team-hub-next" } })
    );
    assert.equal(subdomainInput(renderer).props.value, "team-hub-next");
    assert.equal(subdomainInput(renderer).props["aria-invalid"], undefined);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), new RegExp(serverFailure.message));
    assert.equal(publishButton(renderer).props.disabled, false);
    await act(async () => renderer.unmount());
  });
}

test("a successful publish shows its primary subdomain and fallback path", async () => {
  const result = {
    publishRequest: {
      id: "publish-1",
      status: "published",
      manifestVersion: "3",
      blockingItems: []
    },
    deployment: {
      id: "deployment-1",
      status: "published",
      environment: "app_store",
      route: "/apps/team-hub",
      subdomain: "team-hub",
      subdomainUrl: "https://team-hub.apps.example.test",
      manifestVersion: "3"
    },
    registryEntry: {
      id: "registry-1",
      slug: "release-plan-2026",
      projectId: project.id,
      route: "/apps/team-hub",
      subdomain: "team-hub",
      subdomainUrl: "https://team-hub.apps.example.test",
      status: "published"
    },
    manifest
  };
  const calls = [];
  const client = {
    publishProject: async (...args) => {
      calls.push(args);
      return result;
    },
    listAppStoreRegistry: async () => [result.registryEntry],
    listDeployments: async () => []
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(HookPage, { client }));
  });
  await act(async () => latestPublish.refreshCreatorPublishState(project.id));
  await act(async () => subdomainInput(renderer).props.onChange({ target: { value: "team-hub" } }));
  await act(async () => publishButton(renderer).props.onClick());

  assert.deepEqual(calls, [[project.id, { subdomain: "team-hub" }]]);
  const html = JSON.stringify(renderer.toJSON());
  assert.match(html, /https:\/\/team-hub\.apps\.example\.test/);
  assert.match(html, /\/apps\/team-hub/);
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});
