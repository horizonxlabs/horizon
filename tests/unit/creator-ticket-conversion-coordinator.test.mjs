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

const { createTicketPrdChangeAction } =
  await import("../../apps/creator-web/src/features/tickets/ticket-actions.ts");
const { TicketDetailConversionButton } =
  await import("../../apps/creator-web/src/features/tickets/TicketDetailConversionButton.tsx");

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const ticket = {
  id: "ticket-1",
  ticketNumber: "TKT-1",
  appName: "Leave Management",
  title: "Broken approval",
  submittedByEmail: "user@example.com",
  type: "bug",
  priority: "high",
  status: "submitted",
  description: "Approval is broken",
  deviceInfo: "Safari",
  createdAt: "2026-07-29",
  updatedAt: "2026-07-29",
  timeline: [],
  actions: ["convert_to_prd_change"]
};

function TicketRoute({ client, onOutcome }) {
  const [, render] = React.useReducer((value) => value + 1, 0);
  const conversion = React.useMemo(
    () =>
      createTicketPrdChangeAction({
        projectId: "project-1",
        ticket,
        client,
        refreshInbox: async () => undefined,
        refreshPrdState: async () => undefined
      }),
    [client]
  );
  const isPending = conversion.isPending();
  return React.createElement(TicketDetailConversionButton, {
    conversion,
    isConverting: isPending,
    disabled: isPending,
    onOutcome,
    onPendingChange: () => render()
  });
}

function RouteHarness({ route, client, onOutcome }) {
  return route === "ticket"
    ? React.createElement(TicketRoute, { client, onOutcome })
    : React.createElement("div", null, "Away");
}

test("ticket conversion lock survives route recreation and prevents a second POST", async () => {
  const post = deferred();
  const outcomes = [];
  const onOutcome = (outcome) => outcomes.push(outcome);
  let postCalls = 0;
  const client = {
    async convertTicketToPrdChange() {
      postCalls += 1;
      await post.promise;
    }
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(RouteHarness, { route: "ticket", client, onOutcome }));
  });
  const firstButton = renderer.root.findByType("button");
  let firstRun;
  await act(async () => {
    firstRun = firstButton.props.onClick();
    await Promise.resolve();
  });
  assert.equal(postCalls, 1);

  await act(async () => {
    renderer.update(React.createElement(RouteHarness, { route: "away", client, onOutcome }));
  });
  await act(async () => {
    renderer.update(React.createElement(RouteHarness, { route: "ticket", client, onOutcome }));
  });
  const recreatedButton = renderer.root.findByType("button");
  assert.match(recreatedButton.children.join(""), /Creating PRD Change/);
  let secondRun;
  await act(async () => {
    secondRun = recreatedButton.props.onClick();
    await Promise.resolve();
  });
  assert.equal(postCalls, 1);

  await act(async () => {
    post.resolve();
    await Promise.all([firstRun, secondRun]);
  });
  assert.deepEqual(outcomes, [{ kind: "success", message: "PRD change created." }]);
  await act(async () => renderer.unmount());
});

test.after(() => {
  if (originalActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  else globalThis.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  if (originalReact === undefined) delete globalThis.React;
  else globalThis.React = originalReact;
});
