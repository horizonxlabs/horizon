import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
const originalWindow = globalThis.window;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
const { PublishDialog } =
  await import("../../apps/creator-web/src/features/publish/PublishDialog.tsx");
const { PublishPage } = await import("../../apps/creator-web/src/features/publish/PublishPage.tsx");

function publishApp(overrides = {}) {
  return {
    creatorNavItems: [],
    bootstrap: { projects: [], userName: "Creator", status: "ready" },
    creatorSessionControls: null,
    creatorPage: "publish",
    pageCopy: { title: "Publish & Registry", description: "Review readiness." },
    selectedProject: { id: "project-1", name: "Operations" },
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
      manifest: {
        appId: "app-1",
        manifestVersion: "3",
        app: { slug: "ops", route: "/apps/ops" },
        frontend: { checkpointId: "cp-3", version: "3", checksum: "sha", routes: ["/"] },
        auth: { mode: "platform_auth_sdk", accessMode: "restricted" },
        roles: [{ key: "owner", name: "Owner", permissions: ["manage"] }]
      },
      checklist: [],
      ready: true,
      accessUrlConfig: { baseDomain: "apps.example.test", secure: true }
    },
    publishResult: undefined,
    visibleRegistryEntry: undefined,
    visiblePublishChecklist: [],
    visibleDeployment: undefined,
    visiblePreview: { id: "preview-3", version: "3" },
    publishMessage: "Publish readiness is up to date.",
    publishMessageTone: "success",
    publishMessageTechnicalDetails: undefined,
    ...overrides
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

function textOf(node) {
  return node.children.filter((child) => typeof child === "string").join("");
}

async function renderDialog(client) {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(PublishDialog, { projectId: "project-1", onClose() {}, client })
    );
    await Promise.resolve();
  });
  return renderer;
}

test("PublishPage summarizes readable blockers without invoking its disabled action", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(PublishPage, {
        app: publishApp({
          publishReview: {
            ...publishApp().publishReview,
            checklist: [
              { key: "prd_baseline", label: "PRD baseline", status: "fail", detail: "prd_123" },
              { key: "app_roles", label: "App roles", status: "fail", detail: "owner_user_id" }
            ],
            ready: false
          }
        })
      })
    );
  });
  try {
    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, /Resolve 2 readiness requirements before publishing/);
    assert.match(json, /PRD baseline/);
    assert.match(json, /App roles/);
    assert.doesNotMatch(json, /prd_123|owner_user_id/);
    const publish = renderer.root.find(
      (node) => node.type === "button" && textOf(node).includes("Publish to App Store")
    );
    assert.equal(publish.props.disabled, true);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("PublishPage uses semantic progress and error feedback", () => {
  const publishing = renderToStaticMarkup(
    React.createElement(PublishPage, { app: publishApp({ isPublishingProject: true }) })
  );
  assert.match(publishing, /Publishing…/);
  assert.match(publishing, /disabled/);

  const failed = renderToStaticMarkup(
    React.createElement(PublishPage, {
      app: publishApp({
        publishMessage:
          "Project could not be published. Existing deployment information was preserved.",
        publishMessageTone: "danger",
        publishMessageTechnicalDetails: "publish API 503"
      })
    })
  );
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Technical details/);
  assert.match(failed, /publish API 503/);
});

test("PublishPage retries unavailable readiness for the selected project", async () => {
  const retriedProjects = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(PublishPage, {
        app: publishApp({
          accessLoadState: "unavailable",
          publishReadinessState: "unavailable",
          refreshCreatorPublishState: async (projectId) => retriedProjects.push(projectId),
          publishMessageTechnicalDetails: "readiness API 503"
        })
      })
    );
  });
  try {
    const retry = renderer.root.find(
      (node) => node.type === "button" && textOf(node).includes("Retry readiness")
    );
    await act(async () => retry.props.onClick());
    assert.deepEqual(retriedProjects, ["project-1"]);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("PublishPage retries when access loaded but publish review is unavailable", async () => {
  const retriedProjects = [];
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(PublishPage, {
        app: publishApp({
          publishReview: undefined,
          publishReadinessState: "unavailable",
          refreshCreatorPublishState: async (projectId) => retriedProjects.push(projectId)
        })
      })
    );
  });
  try {
    const retry = renderer.root.find(
      (node) => node.type === "button" && textOf(node).includes("Retry readiness")
    );
    await act(async () => retry.props.onClick());
    assert.deepEqual(retriedProjects, ["project-1"]);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("PublishDialog labels an in-flight deployment and preserves its request", async () => {
  const pending = deferred();
  const calls = [];
  const client = {
    listDeployments: async () => [],
    publishProject: (projectId, environment) => {
      calls.push([projectId, environment]);
      return pending.promise;
    },
    promoteDeployment: async () => undefined
  };
  const renderer = await renderDialog(client);
  try {
    const deploy = renderer.root.find(
      (node) => node.type === "button" && textOf(node).includes("Deploy to Staging")
    );
    await act(async () => {
      deploy.props.onClick();
      await Promise.resolve();
    });
    assert.deepEqual(calls, [["project-1", "staging"]]);
    assert.match(JSON.stringify(renderer.toJSON()), /Deploying…/);
    assert.equal(
      renderer.root.findAllByType("button").filter((button) => button.props.disabled).length >= 2,
      true
    );

    pending.resolve({ deployment: { healthStatus: "healthy" } });
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
    assert.match(JSON.stringify(renderer.toJSON()), /Deployed to staging/);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("PublishDialog labels an in-flight promotion and preserves its request", async () => {
  const pending = deferred();
  let promotedProject;
  const client = {
    listDeployments: async () => [
      {
        id: "staging-1",
        environment: "staging",
        healthStatus: "healthy",
        commitSha: "1234567890",
        slug: "ops",
        createdAt: "2026-08-24T12:00:00.000Z"
      }
    ],
    publishProject: async () => undefined,
    promoteDeployment: (projectId) => {
      promotedProject = projectId;
      return pending.promise;
    }
  };
  const renderer = await renderDialog(client);
  try {
    const promote = renderer.root.find(
      (node) => node.type === "button" && textOf(node).includes("Promote Staging")
    );
    assert.equal(promote.props.disabled, false);
    await act(async () => {
      promote.props.onClick();
      await Promise.resolve();
    });
    assert.equal(promotedProject, "project-1");
    const busyJson = JSON.stringify(renderer.toJSON());
    assert.match(busyJson, /Promoting…/);
    assert.match(busyJson, /Rebuilding and health-checking the production app/);
    assert.match(busyJson, /safe to close this dialog/);
    pending.resolve({ deployment: { healthStatus: "healthy" } });
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("PublishDialog presents deployment failures as outcomes with technical details", async () => {
  const client = {
    listDeployments: async () => [],
    publishProject: async () => {
      throw new Error("deployment API 503");
    },
    promoteDeployment: async () => undefined
  };
  const renderer = await renderDialog(client);
  try {
    const deploy = renderer.root.find(
      (node) => node.type === "button" && textOf(node).includes("Deploy to Staging")
    );
    await act(async () => {
      deploy.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.equal(alert.props.role, "alert");
    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, /Deployment could not be completed/);
    assert.match(json, /Technical details/);
    assert.match(json, /deployment API 503/);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("PublishDialog presents deployment-history failures as one actionable warning", async () => {
  const client = {
    listDeployments: async () => {
      throw new Error("history API 503");
    },
    publishProject: async () => undefined,
    promoteDeployment: async () => undefined
  };
  const renderer = await renderDialog(client);
  try {
    const messages = renderer.root.findAll((node) =>
      node.props.className?.includes("creator-status-message")
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0].props.className, /warning/);
    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, /Deployment history could not be loaded/);
    assert.match(json, /Technical details/);
    assert.match(json, /history API 503/);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test("PublishDialog presents promotion failures as outcomes with technical details", async () => {
  const client = {
    listDeployments: async () => [
      {
        id: "staging-1",
        environment: "staging",
        healthStatus: "healthy",
        commitSha: "1234567890",
        slug: "ops",
        createdAt: "2026-08-24T12:00:00.000Z"
      }
    ],
    publishProject: async () => undefined,
    promoteDeployment: async () => {
      throw new Error("promotion API 409");
    }
  };
  const renderer = await renderDialog(client);
  try {
    const promote = renderer.root.find(
      (node) => node.type === "button" && textOf(node).includes("Promote Staging")
    );
    assert.equal(promote.props.disabled, false);
    await act(async () => {
      promote.props.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    const alert = renderer.root.find((node) => node.props.role === "alert");
    assert.equal(alert.props.role, "alert");
    const json = JSON.stringify(renderer.toJSON());
    assert.match(json, /Promotion could not be completed/);
    assert.match(json, /Technical details/);
    assert.match(json, /promotion API 409/);
  } finally {
    await act(async () => renderer.unmount());
  }
});

test.after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});
