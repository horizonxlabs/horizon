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

const selectedProject = {
  id: "project-1",
  name: "Project One",
  appType: "Workflow App",
  status: "active",
  owner: "Creator",
  prdVersion: "0.1",
  frontendVersion: "fe-1",
  tokenUsedThisMonth: 0
};

const publishState = {
  access: {
    members: [],
    invitations: [],
    accessRequests: [],
    roles: []
  },
  review: undefined,
  registry: []
};

let latest;
function AccessProbe({ client, loadAccessState, loadPublishState }) {
  latest = usePublishAccess({
    selectedProject,
    clientFactory: () => client,
    loadAccessState: loadAccessState ?? (async () => publishState.access),
    loadPublishState
  });
  const ids = latest.decidingAccessRequestIds
    ? [...latest.decidingAccessRequestIds].sort().join(",")
    : (latest.decidingAccessRequestId ?? "");
  return React.createElement("output", null, `${ids}|${latest.publishMessage}`);
}

const invitationInput = {
  email: "new.user@company.com",
  roleKey: "employee",
  userType: "internal",
  note: "Use the project app"
};

test("a successful invitation refreshes only app access and never requires publish readiness", async () => {
  let invitationCalls = 0;
  let accessRefreshCalls = 0;
  let publishRefreshCalls = 0;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {
          createAppInvitation: async (_projectId, input) => {
            invitationCalls += 1;
            return { id: "invite-1", status: "pending", ...input };
          }
        },
        loadAccessState: async () => {
          accessRefreshCalls += 1;
          return {
            ...publishState.access,
            invitations: [{ id: "invite-1", status: "pending", ...invitationInput }]
          };
        },
        loadPublishState: async () => {
          publishRefreshCalls += 1;
          throw new Error("PRD baseline is required before opening workspace");
        }
      })
    );
  });

  let result;
  await act(async () => {
    result = await latest.handleInviteUser(invitationInput);
  });

  assert.equal(result, true);
  assert.equal(invitationCalls, 1);
  assert.equal(accessRefreshCalls, 1);
  assert.equal(publishRefreshCalls, 0);
  assert.match(latest.publishMessage, /Invitation sent/i);
  assert.doesNotMatch(latest.publishMessage, /baseline|workspace/i);
  await act(async () => renderer.unmount());
});

test("a completed invitation stays successful when the access refresh fails", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {
          createAppInvitation: async (_projectId, input) => ({
            id: "invite-2",
            status: "pending",
            ...input
          })
        },
        loadAccessState: async () => {
          throw new Error("access refresh offline");
        },
        loadPublishState: async () => publishState
      })
    );
  });

  let result;
  await act(async () => {
    result = await latest.handleInviteUser(invitationInput);
  });

  assert.equal(result, true);
  assert.match(latest.publishMessage, /Invitation sent/i);
  assert.match(latest.publishMessage, /refresh failed.*access refresh offline/i);
  assert.doesNotMatch(latest.publishMessage, /Invitation failed/i);
  await act(async () => renderer.unmount());
});

test("an email with a pending invitation cannot be invited twice", async () => {
  let invitationCalls = 0;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {
          createAppInvitation: async () => {
            invitationCalls += 1;
          }
        },
        loadAccessState: async () => publishState.access,
        loadPublishState: async () => publishState
      })
    );
  });
  await act(async () => {
    latest.setAppAccessSnapshot({
      ...publishState.access,
      invitations: [
        {
          id: "invite-existing",
          email: "NEW.USER@company.com",
          roleKey: "employee",
          userType: "internal",
          status: "pending"
        }
      ]
    });
  });

  let result;
  await act(async () => {
    result = await latest.handleInviteUser(invitationInput);
  });

  assert.equal(result, false);
  assert.equal(invitationCalls, 0);
  assert.match(latest.publishMessage, /already has a pending invitation/i);
  await act(async () => renderer.unmount());
});

test("the pending invitations view excludes accepted and revoked invitations", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {},
        loadAccessState: async () => publishState.access,
        loadPublishState: async () => publishState
      })
    );
  });
  await act(async () => {
    latest.setAppAccessSnapshot({
      ...publishState.access,
      invitations: [
        { id: "pending", status: "pending", ...invitationInput },
        { id: "approval", status: "approval_required", ...invitationInput },
        { id: "accepted", status: "accepted", ...invitationInput },
        { id: "revoked", status: "revoked", ...invitationInput }
      ]
    });
  });

  assert.deepEqual(
    latest.visiblePendingInvites.map((invitation) => invitation.status),
    ["pending", "approval_required"]
  );
  await act(async () => renderer.unmount());
});

test("two access-request rows remain independently pending until each completion", async () => {
  const first = deferred();
  const second = deferred();
  const client = {
    decideAppAccessRequest(_projectId, input) {
      return input.requestId === "request-1" ? first.promise : second.promise;
    }
  };
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client,
        loadPublishState: async () => publishState
      })
    );
  });
  let firstRun;
  let secondRun;
  await act(async () => {
    firstRun = latest.handleAccessRequestDecision("request-1", "approved");
    secondRun = latest.handleAccessRequestDecision("request-2", "rejected");
    await Promise.resolve();
  });
  const pendingIds = latest.decidingAccessRequestIds
    ? [...latest.decidingAccessRequestIds]
    : latest.decidingAccessRequestId
      ? [latest.decidingAccessRequestId]
      : [];
  assert.deepEqual(pendingIds.sort(), ["request-1", "request-2"]);

  await act(async () => {
    first.resolve({ id: "request-1", status: "approved" });
    await firstRun;
  });
  assert.deepEqual(
    latest.decidingAccessRequestIds
      ? [...latest.decidingAccessRequestIds]
      : latest.decidingAccessRequestId
        ? [latest.decidingAccessRequestId]
        : [],
    ["request-2"]
  );

  await act(async () => {
    second.resolve({ id: "request-2", status: "rejected" });
    await secondRun;
  });
  assert.deepEqual(
    latest.decidingAccessRequestIds
      ? [...latest.decidingAccessRequestIds]
      : latest.decidingAccessRequestId
        ? [latest.decidingAccessRequestId]
        : [],
    []
  );
  await act(async () => renderer.unmount());
});

test("access decision POST failure reports failure without refreshing", async () => {
  let refreshCalls = 0;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {
          decideAppAccessRequest: async () => {
            throw new Error("decision rejected");
          }
        },
        loadAccessState: async () => {
          refreshCalls += 1;
          return publishState.access;
        }
      })
    );
  });
  await act(async () => {
    await latest.handleAccessRequestDecision("request-1", "approved");
  });
  assert.equal(refreshCalls, 0);
  assert.match(latest.publishMessage, /Access decision failed: decision rejected/);
  assert.deepEqual(
    latest.decidingAccessRequestIds
      ? [...latest.decidingAccessRequestIds]
      : latest.decidingAccessRequestId
        ? [latest.decidingAccessRequestId]
        : [],
    []
  );
  await act(async () => renderer.unmount());
});

test("access decision POST success remains confirmed when refresh fails", async () => {
  let postCalls = 0;
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {
          decideAppAccessRequest: async () => {
            postCalls += 1;
            return { id: "request-1", status: "approved" };
          }
        },
        loadAccessState: async () => {
          throw new Error("refresh offline");
        },
        loadPublishState: async () => publishState
      })
    );
  });
  await act(async () => {
    await latest.handleAccessRequestDecision("request-1", "approved");
  });
  assert.equal(postCalls, 1);
  assert.match(latest.publishMessage, /approved through Platform API/i);
  assert.match(latest.publishMessage, /refresh failed.*refresh offline/i);
  assert.doesNotMatch(latest.publishMessage, /decision failed/i);
  await act(async () => renderer.unmount());
});

test("publish readiness load failure replaces the indefinite loading message", async () => {
  let renderer;
  await act(async () => {
    renderer = create(
      React.createElement(AccessProbe, {
        client: {},
        loadPublishState: async () => {
          throw new Error("Confirm a PRD baseline before publishing");
        }
      })
    );
  });

  await act(async () => {
    await assert.rejects(
      () => latest.refreshCreatorPublishState(selectedProject.id),
      /Confirm a PRD baseline/
    );
  });
  assert.match(latest.publishMessage, /Publish readiness unavailable/i);
  assert.match(latest.publishMessage, /Confirm a PRD baseline before publishing/);
  assert.doesNotMatch(latest.publishMessage, /Loading publish state/);
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
