import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const originalReact = globalThis.React;
const originalActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = (await import("react")).default;
const requireFromStore = createRequire(
  new URL("../../apps/app-store-pwa/package.json", import.meta.url)
);
const { act, create } = requireFromStore("react-test-renderer");

const { usePublishAccess } =
  await import("../../apps/creator-web/src/features/publish/use-publish-access.ts");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const projectA = {
  id: "project-a",
  name: "Project A",
  appType: "Workflow App",
  status: "active",
  owner: "Creator",
  prdVersion: "0.1",
  frontendVersion: "fe-a",
  tokenUsedThisMonth: 0
};

const projectB = {
  ...projectA,
  id: "project-b",
  name: "Project B",
  frontendVersion: "fe-b"
};

function accessSnapshot(project) {
  return {
    members: [],
    invitations: [],
    accessRequests: [],
    roles: [
      {
        id: `role-${project}`,
        key: "manager",
        name: `${project} Manager`,
        permissions: [`${project}.approve`],
        memberCount: 1
      }
    ]
  };
}

function publishState(project) {
  return {
    review: {
      checklist: [],
      manifest: { manifestVersion: `manifest-${project}` }
    },
    registry: [
      {
        id: `registry-${project}`,
        projectId: `project-${project.toLowerCase()}`,
        manifestVersion: `manifest-${project}`
      }
    ],
    deployments: [
      {
        id: `deployment-${project}`,
        projectId: `project-${project.toLowerCase()}`,
        environment: "app_store",
        healthStatus: "healthy",
        createdAt: `2026-08-${project === "A" ? "20" : "21"}T00:00:00.000Z`
      }
    ]
  };
}

let latest;
function AccessProbe({
  client,
  loadAccessState,
  loadPublishState,
  selectedProject = projectA
}) {
  latest = usePublishAccess({
    selectedProject,
    clientFactory: () => client,
    loadAccessState,
    loadPublishState
  });
  return React.createElement("output", null, latest.publishMessage);
}

const invitationInput = {
  email: " NEW.USER@COMPANY.COM ",
  roleKey: "manager",
  userType: "internal",
  note: " Quarterly approval access "
};

test("a Project A invitation success after reset cannot claim Project B generation", async () => {
  const invitationA = deferred();
  const invitationPayloadsB = [];
  const accessProjects = [];
  let renderer;
  const renderProbe = (selectedProject, client) =>
    React.createElement(AccessProbe, {
      selectedProject,
      client,
      loadAccessState: async (projectId) => {
        accessProjects.push(projectId);
        return accessSnapshot(projectId === "project-b" ? "B" : "A");
      },
      loadPublishState: async () => publishState("B")
    });

  await act(async () => {
    renderer = create(
      renderProbe(projectA, {
        createAppInvitation: async () => invitationA.promise
      })
    );
  });

  let staleInvitation;
  await act(async () => {
    staleInvitation = latest.handleInviteUser(invitationInput);
    await Promise.resolve();
    latest.resetPublishAccess();
    renderer.update(
      renderProbe(projectB, {
        async createAppInvitation(projectId, payload) {
          invitationPayloadsB.push([projectId, payload]);
        }
      })
    );
    invitationA.resolve();
    await staleInvitation;
  });

  assert.deepEqual(accessProjects, []);
  assert.equal(latest.publishMessage, "Loading access and publish information.");

  await act(async () => {
    assert.equal(await latest.handleInviteUser(invitationInput), true);
  });
  assert.deepEqual(invitationPayloadsB, [
    [
      "project-b",
      {
        email: "new.user@company.com",
        roleKey: "manager",
        userType: "internal",
        note: "Quarterly approval access"
      }
    ]
  ]);
  assert.deepEqual(accessProjects, ["project-b"]);
  assert.equal(latest.visibleAppRoles[0].role, "B Manager");
  assert.equal(
    latest.publishMessage,
    "Invitation sent to new.user@company.com. Access information is up to date."
  );
  await act(async () => renderer.unmount());
});

test("a stale invitation failure cannot replace Project B feedback or clear its pending invite", async () => {
  const invitationA = deferred();
  const invitationB = deferred();
  let renderer;
  const renderProbe = (selectedProject, client) =>
    React.createElement(AccessProbe, {
      selectedProject,
      client,
      loadAccessState: async (projectId) =>
        accessSnapshot(projectId === "project-b" ? "B" : "A"),
      loadPublishState: async () => publishState("B")
    });

  await act(async () => {
    renderer = create(
      renderProbe(projectA, { createAppInvitation: async () => invitationA.promise })
    );
  });
  let staleInvitation;
  await act(async () => {
    staleInvitation = latest.handleInviteUser(invitationInput);
    await Promise.resolve();
    latest.resetPublishAccess();
    renderer.update(
      renderProbe(projectB, { createAppInvitation: async () => invitationB.promise })
    );
    await latest.refreshCreatorPublishState("project-b");
  });
  assertProjectBState();

  let currentInvitation;
  await act(async () => {
    currentInvitation = latest.handleInviteUser(invitationInput);
    await Promise.resolve();
  });
  assert.equal(latest.isInvitingUser, true);

  await act(async () => {
    invitationA.reject(new Error("Project A invitation failed late"));
    await staleInvitation;
  });
  assert.equal(latest.isInvitingUser, true);
  assertProjectBState();

  await act(async () => {
    invitationB.resolve();
    await currentInvitation;
  });
  assert.equal(latest.isInvitingUser, false);
  assert.equal(
    latest.publishMessage,
    "Invitation sent to new.user@company.com. Access information is up to date."
  );
  await act(async () => renderer.unmount());
});

test("a Project A decision success after reset cannot claim Project B generation", async () => {
  const decisionA = deferred();
  const decisionPayloadsB = [];
  const accessProjects = [];
  let renderer;
  const renderProbe = (selectedProject, client) =>
    React.createElement(AccessProbe, {
      selectedProject,
      client,
      loadAccessState: async (projectId) => {
        accessProjects.push(projectId);
        return accessSnapshot(projectId === "project-b" ? "B" : "A");
      },
      loadPublishState: async () => publishState("B")
    });

  await act(async () => {
    renderer = create(
      renderProbe(projectA, {
        decideAppAccessRequest: async () => decisionA.promise
      })
    );
  });
  let staleDecision;
  await act(async () => {
    staleDecision = latest.handleAccessRequestDecision("request-shared", "approved");
    latest.resetPublishAccess();
    renderer.update(
      renderProbe(projectB, {
        async decideAppAccessRequest(projectId, payload) {
          decisionPayloadsB.push([projectId, payload]);
        }
      })
    );
    decisionA.resolve();
    await staleDecision;
  });

  assert.deepEqual(accessProjects, []);
  assert.equal(latest.publishMessage, "Loading access and publish information.");
  assert.equal(latest.decidingAccessRequestIds.has("request-shared"), false);

  await act(async () => {
    await latest.handleAccessRequestDecision("request-shared", "rejected");
  });
  assert.deepEqual(decisionPayloadsB, [
    ["project-b", { requestId: "request-shared", decision: "rejected" }]
  ]);
  assert.deepEqual(accessProjects, ["project-b"]);
  assert.equal(latest.visibleAppRoles[0].role, "B Manager");
  assert.equal(
    latest.publishMessage,
    "Access request rejected. Access information is up to date."
  );
  await act(async () => renderer.unmount());
});

test("a stale decision failure cannot replace Project B feedback or clear its pending decision", async () => {
  const decisionA = deferred();
  const decisionB = deferred();
  const decisionPayloadsB = [];
  let renderer;
  const renderProbe = (selectedProject, client) =>
    React.createElement(AccessProbe, {
      selectedProject,
      client,
      loadAccessState: async (projectId) =>
        accessSnapshot(projectId === "project-b" ? "B" : "A"),
      loadPublishState: async () => publishState("B")
    });

  await act(async () => {
    renderer = create(
      renderProbe(projectA, { decideAppAccessRequest: async () => decisionA.promise })
    );
  });
  let staleDecision;
  await act(async () => {
    staleDecision = latest.handleAccessRequestDecision("request-shared", "approved");
    await Promise.resolve();
    latest.resetPublishAccess();
    renderer.update(
      renderProbe(projectB, {
        async decideAppAccessRequest(projectId, payload) {
          decisionPayloadsB.push([projectId, payload]);
          return decisionB.promise;
        }
      })
    );
    await latest.refreshCreatorPublishState("project-b");
  });
  assertProjectBState();

  let currentDecision;
  await act(async () => {
    currentDecision = latest.handleAccessRequestDecision("request-shared", "rejected");
    await Promise.resolve();
  });
  assert.equal(latest.decidingAccessRequestIds.has("request-shared"), true);

  await act(async () => {
    decisionA.reject(new Error("Project A decision failed late"));
    await staleDecision;
  });
  assert.equal(latest.decidingAccessRequestIds.has("request-shared"), true);
  assertProjectBState();

  await act(async () => {
    decisionB.resolve();
    await currentDecision;
  });
  assert.deepEqual(decisionPayloadsB, [
    ["project-b", { requestId: "request-shared", decision: "rejected" }]
  ]);
  assert.equal(latest.decidingAccessRequestIds.has("request-shared"), false);
  assert.equal(
    latest.publishMessage,
    "Access request rejected. Access information is up to date."
  );
  await act(async () => renderer.unmount());
});

function assertProjectBState() {
  assert.equal(latest.accessLoadState, "ready");
  assert.deepEqual(latest.visibleAppRoles, [
    {
      role: "B Manager",
      permissions: "B.approve",
      members: "1",
      status: "active"
    }
  ]);
  assert.equal(latest.publishReview.manifest.manifestVersion, "manifest-B");
  assert.equal(latest.publishResult, undefined);
  assert.deepEqual(
    latest.registryEntries.map((entry) => entry.id),
    ["registry-B"]
  );
  assert.deepEqual(
    latest.runtimeDeployments.map((deployment) => deployment.id),
    ["deployment-B"]
  );
  assert.equal(latest.publishMessage, "Access information and publish readiness are up to date.");
  assert.equal(latest.publishMessageTone, "success");
  assert.equal(latest.publishMessageTechnicalDetails, undefined);
}

test.after(() => {
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
