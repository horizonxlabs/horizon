import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";

const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalReact = globalThis.React;
const originalWindow = globalThis.window;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
globalThis.window = {
  location: { pathname: "/creator/projects/project-1/publish" },
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {}
};
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");
const { PublishPage } =
  await import("../../apps/creator-web/src/features/publish/PublishPage.tsx");
const { usePublishAccess } =
  await import("../../apps/creator-web/src/features/publish/use-publish-access.ts");

const project = {
  id: "project-1", name: "Operations", appType: "Workflow App", status: "active",
  owner: "Creator", prdVersion: "1", frontendVersion: "3", tokenUsedThisMonth: 0
};
const manifest = {
  appId: "app-1", manifestVersion: "3", app: { slug: "ops", route: "/apps/ops" },
  frontend: { checkpointId: "cp-3", version: "3", checksum: "sha", routes: ["/"] },
  auth: { mode: "platform_auth_sdk", accessMode: "restricted" },
  roles: [{ key: "owner", name: "Owner", permissions: ["manage"] }]
};
const checklistLabels = {
  prd_baseline: "PRD baseline",
  active_frontend: "Active frontend checkpoint",
  app_roles: "App roles",
  app_owner: "At least one owner",
  blocking_guardrail: "No blocking guardrail event"
};

function checklist(failedKey) {
  const items = Object.entries(checklistLabels).map(([key, label]) => ({
    key, label, status: key === failedKey ? "fail" : "pass", detail: `${label} detail`
  }));
  if (failedKey && !checklistLabels[failedKey]) {
    items.push({
      key: failedKey,
      label: "Internal release policy X-42",
      status: "fail",
      detail: "raw_policy_token=secret"
    });
  }
  return items;
}

function pageApp(overrides = {}) {
  return {
    creatorNavItems: [],
    bootstrap: { projects: [project], selectedProject: project, userName: "Creator", status: "ready" },
    creatorSessionControls: null,
    creatorPage: "publish",
    pageCopy: { title: "Publish & Registry", description: "Review readiness." },
    selectedProject: project,
    creatorPageActions: null,
    isCreateProjectDialogOpen: false,
    setIsCreateProjectDialogOpen() {},
    isEnteringWorkspace: false,
    onNavigate() {},
    pathname: "/creator/projects/project-1/publish",
    handlePublishProject() {},
    isPublishingProject: false,
    accessLoadState: "ready",
    publishReadinessState: "ready",
    publishReview: {
      manifest,
      checklist: checklist(),
      ready: true,
      accessUrlConfig: { baseDomain: "apps.example.test", secure: true }
    },
    publishResult: undefined,
    visibleRegistryEntry: undefined,
    visiblePublishChecklist: [],
    visibleDeployment: undefined,
    visiblePreview: { id: "preview-3", version: "3" },
    publishMessage: "Access information and publish readiness are up to date.",
    publishMessageTone: "success",
    publishMessageTechnicalDetails: undefined,
    refreshCreatorPublishState: async () => undefined,
    ...overrides
  };
}

function stage(renderer, label) {
  return renderer.root.find(
    (node) =>
      node.type === "li" &&
      node.props.className?.includes("creator-readiness-item") &&
      node.findAll((child) => child.type === "strong" && child.children.includes(label)).length === 1
  );
}

function publishButton(renderer) {
  return renderer.root.find(
    (node) => node.type === "button" && node.children.includes("Publish to App Store")
  );
}

function statusPanels(renderer) {
  return renderer.root.findAll(
    (node) => node.props.className?.includes("creator-status-message")
  );
}

test("stable checklist keys map every authoritative blocker to a truthful stage", async () => {
  const cases = [
    ["prd_baseline", "Manifest", "PRD baseline"],
    ["active_frontend", "Preview", "Active frontend checkpoint"],
    ["app_roles", "Permissions", "App roles"],
    ["app_owner", "Permissions", "Project owner"],
    ["blocking_guardrail", "Registry", "Publish guardrail"],
    ["future_policy_key", "Registry", "Additional publish requirement"]
  ];
  for (const [failedKey, expectedStage, readableBlocker] of cases) {
    let renderer;
    await act(async () => {
      renderer = create(React.createElement(PublishPage, { app: pageApp({
        publishReview: { manifest, checklist: checklist(failedKey), ready: false },
        visiblePublishChecklist: [
          { check: "Misleading preview label", state: "fail", detail: "raw display detail" }
        ]
      }) }));
    });
    assert.match(stage(renderer, expectedStage).props.className, /is-blocking/);
    assert.equal(publishButton(renderer).props.disabled, true);
    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, new RegExp(readableBlocker));
    assert.doesNotMatch(json, /raw display detail|raw_policy_token|Internal release policy X-42/);
    await act(async () => renderer.unmount());
  }
});

test("a blocked review without a failed checklist item uses a truthful Registry fallback", async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(PublishPage, { app: pageApp({
      publishReview: { manifest, checklist: checklist(), ready: false }
    }) }));
  });
  assert.match(stage(renderer, "Registry").props.className, /is-blocking/);
  assert.match(JSON.stringify(renderer.toJSON()), /Additional publish requirement/);
  assert.equal(publishButton(renderer).props.disabled, true);
  await act(async () => renderer.unmount());
});

let latestPublish;
function HookPage({ loadAccessState, loadPublishState, clientFactory = () => ({}), selectedProject = project }) {
  latestPublish = usePublishAccess({
    selectedProject,
    clientFactory,
    loadAccessState,
    loadPublishState
  });
  return React.createElement(PublishPage, { app: pageApp({ ...latestPublish, selectedProject }) });
}

function readyPublishState() {
  return {
    review: {
      manifest,
      checklist: checklist(),
      ready: true,
      accessUrlConfig: { baseDomain: "apps.example.test", secure: true }
    },
    registry: [],
    deployments: []
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

test("the Creator publish caller sends a generated app-store subdomain label", async () => {
  const selectedProject = { ...project, id: "release_plan_2026", name: "สวัสดี" };
  let publishArgs;
  const client = {
    publishProject: async (...args) => {
      publishArgs = args;
      return {
        publishRequest: { id: "publish-1", status: "published", manifestVersion: "3", blockingItems: [] },
        deployment: { id: "deployment-1", status: "published", route: "/apps/release-plan-2026" },
        registryEntry: { id: "registry-1", slug: "release-plan-2026", status: "published" },
        manifest
      };
    },
    listAppStoreRegistry: async () => [],
    listDeployments: async () => []
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(HookPage, {
      selectedProject,
      clientFactory: () => client,
      loadAccessState: async () => ({ members: [], invitations: [], accessRequests: [], roles: [] }),
      loadPublishState: async () => readyPublishState()
    }));
  });

  await act(async () => latestPublish.handlePublishProject());

  assert.deepEqual(publishArgs, ["release_plan_2026", { subdomain: "release-plan-2026" }]);
  await act(async () => renderer.unmount());
});

test("a failed refresh disables a retained ready review at the real hook and page boundary", async () => {
  let publishLoads = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(HookPage, {
      loadAccessState: async () => ({ members: [], invitations: [], accessRequests: [], roles: [] }),
      loadPublishState: async () => {
        publishLoads += 1;
        if (publishLoads === 1) return readyPublishState();
        throw new Error("publish review API 503");
      }
    }));
  });
  await act(async () => latestPublish.refreshCreatorPublishState(project.id));
  assert.equal(publishButton(renderer).props.disabled, false);

  await act(async () => {
    await assert.rejects(
      () => latestPublish.refreshCreatorPublishState(project.id),
      /publish review API 503/
    );
  });
  assert.equal(latestPublish.publishReview.ready, true);
  assert.equal(latestPublish.publishReadinessState, "unavailable");
  assert.equal(publishButton(renderer).props.disabled, true);
  assert.equal(statusPanels(renderer).length, 1);
  assert.match(statusPanels(renderer)[0].props.className, /warning/);
  assert.match(JSON.stringify(renderer.toJSON()), /Publish readiness is unavailable/);
  await act(async () => renderer.unmount());
});

test("a first-load access failure renders exactly one visible readiness warning", async () => {
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(HookPage, {
      loadAccessState: async () => { throw new Error("access API 503"); },
      loadPublishState: async () => readyPublishState()
    }));
  });
  await act(async () => {
    await assert.rejects(() => latestPublish.refreshCreatorPublishState(project.id), /access API 503/);
  });
  assert.equal(latestPublish.publishReadinessState, "unavailable");
  assert.equal(statusPanels(renderer).length, 1);
  assert.match(statusPanels(renderer)[0].props.className, /warning/);
  const json = JSON.stringify(renderer.toJSON());
  assert.match(json, /Publish readiness is unavailable/);
  assert.doesNotMatch(json, /creator-status-message-danger/);
  assert.equal(publishButton(renderer).props.disabled, true);
  await act(async () => renderer.unmount());
});

test("an older same-project success cannot replace a newer failed refresh", async () => {
  const olderPublish = deferred();
  let publishLoads = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(HookPage, {
      loadAccessState: async () => ({ members: [], invitations: [], accessRequests: [], roles: [] }),
      loadPublishState: async () => {
        publishLoads += 1;
        if (publishLoads === 1) return readyPublishState();
        if (publishLoads === 2) return olderPublish.promise;
        throw new Error("newer publish review failed");
      }
    }));
  });
  await act(async () => latestPublish.refreshCreatorPublishState(project.id));
  assert.equal(publishButton(renderer).props.disabled, false);

  let olderRefresh;
  await act(async () => {
    olderRefresh = latestPublish.refreshCreatorPublishState(project.id);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await assert.rejects(
      () => latestPublish.refreshCreatorPublishState(project.id),
      /newer publish review failed/
    );
  });
  olderPublish.resolve({
    ...readyPublishState(),
    review: { ...readyPublishState().review, manifest: { ...manifest, manifestVersion: "stale" } }
  });
  await act(async () => olderRefresh);

  assert.equal(latestPublish.publishReview.manifest.manifestVersion, "3");
  assert.equal(latestPublish.publishReadinessState, "unavailable");
  const publish = publishButton(renderer);
  assert.equal(publish.props.disabled, true);
  assert.doesNotMatch(publish.props.className, /bg-primary/);
  assert.equal(statusPanels(renderer).length, 1);
  assert.match(statusPanels(renderer)[0].props.className, /warning/);
  await act(async () => renderer.unmount());
});

test("an older same-project failure cannot replace a newer successful refresh", async () => {
  const olderPublish = deferred();
  let publishLoads = 0;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(HookPage, {
      loadAccessState: async () => ({ members: [], invitations: [], accessRequests: [], roles: [] }),
      loadPublishState: async () => {
        publishLoads += 1;
        if (publishLoads === 1) return olderPublish.promise;
        return {
          ...readyPublishState(),
          review: { ...readyPublishState().review, manifest: { ...manifest, manifestVersion: "latest" } }
        };
      }
    }));
  });

  let olderRefresh;
  await act(async () => {
    olderRefresh = latestPublish.refreshCreatorPublishState(project.id);
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => latestPublish.refreshCreatorPublishState(project.id));
  olderPublish.reject(new Error("older publish review failed"));
  await act(async () => olderRefresh);

  assert.equal(latestPublish.publishReview.manifest.manifestVersion, "latest");
  assert.equal(latestPublish.publishReadinessState, "ready");
  assert.equal(latestPublish.publishMessageTone, "success");
  assert.equal(latestPublish.publishMessageTechnicalDetails, undefined);
  assert.equal(publishButton(renderer).props.disabled, false);
  assert.equal(statusPanels(renderer).length, 1);
  assert.match(statusPanels(renderer)[0].props.className, /success/);
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
