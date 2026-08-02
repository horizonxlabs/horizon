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
function AccessProbe({ client, loadPublishState }) {
  latest = usePublishAccess({
    selectedProject,
    clientFactory: () => client,
    loadPublishState
  });
  const ids = latest.decidingAccessRequestIds
    ? [...latest.decidingAccessRequestIds].sort().join(",")
    : (latest.decidingAccessRequestId ?? "");
  return React.createElement("output", null, `${ids}|${latest.publishMessage}`);
}

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
        loadPublishState: async () => {
          refreshCalls += 1;
          return publishState;
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
        loadPublishState: async () => {
          throw new Error("refresh offline");
        }
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

test.after(() => {
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
