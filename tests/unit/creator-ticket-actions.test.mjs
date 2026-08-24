import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { createPlatformApiClient, success } = await import("../../packages/api-client/src/index.ts");
const { createTicketPrdChangeAction, getTicketPrdChangeActionState, refreshCreatorTicketInbox } =
  await import("../../apps/creator-web/src/features/tickets/ticket-actions.ts");
const { TicketDetailConversionButton } =
  await import("../../apps/creator-web/src/features/tickets/TicketDetailConversionButton.tsx");

const ticket = {
  id: "ticket_1",
  ticketNumber: "TKT-0001",
  appName: "Leave Management",
  title: "WFH leave type missing",
  submittedByEmail: "user@company.com",
  type: "bug",
  priority: "high",
  status: "submitted",
  description: "WFH is not visible on mobile.",
  deviceInfo: "iPhone Safari",
  createdAt: "2026-07-29T00:00:00.000Z",
  updatedAt: "2026-07-29T00:00:00.000Z",
  timeline: [],
  actions: ["convert_to_prd_change"]
};

test("ticket inbox refresh rejects API failures after exposing the error state", async () => {
  await assert.rejects(
    () =>
      refreshCreatorTicketInbox("proj_1", {
        request: async () => {
          throw new Error("inbox unavailable");
        }
      }),
    /inbox unavailable/
  );
});

test("ticket detail conversion button action deduplicates a pending click", async () => {
  let resolvePost;
  let postCalls = 0;
  const action = createTicketPrdChangeAction({
    projectId: "proj_1",
    ticket,
    client: {
      convertTicketToPrdChange: async () => {
        postCalls += 1;
        await new Promise((resolve) => {
          resolvePost = resolve;
        });
      }
    },
    refreshInbox: async () => undefined,
    refreshPrdState: async () => undefined
  });

  const firstClick = action.run();
  const secondClick = action.run();
  assert.equal(postCalls, 1);
  const pendingState = getTicketPrdChangeActionState("proj_1", ticket.id);
  resolvePost();
  await Promise.all([firstClick, secondClick]);
  assert.deepEqual(pendingState, {
    pending: true,
    outcome: { kind: "pending", message: "Creating PRD change." }
  });
  assert.equal(action.isPending(), false);
});

test("ticket detail conversion preserves POST success when governed refresh fails", async () => {
  let inboxRefreshCalls = 0;
  let prdRefreshCalls = 0;
  const action = createTicketPrdChangeAction({
    projectId: "proj_1",
    ticket,
    client: { convertTicketToPrdChange: async () => undefined },
    refreshInbox: async () => {
      inboxRefreshCalls += 1;
      throw new Error("inbox refresh unavailable");
    },
    refreshPrdState: async () => {
      prdRefreshCalls += 1;
    }
  });

  assert.deepEqual(await action.run(), {
    kind: "partial-success",
    message: "PRD change was created, but the latest governed state could not be loaded.",
    technicalDetails: "inbox refresh unavailable"
  });
  assert.equal(inboxRefreshCalls, 1);
  assert.equal(prdRefreshCalls, 1);
});

test("ticket detail conversion reports POST failure without refreshes", async () => {
  let refreshCalls = 0;
  const action = createTicketPrdChangeAction({
    projectId: "proj_1",
    ticket,
    client: {
      convertTicketToPrdChange: async () => {
        throw new Error("conversion rejected");
      }
    },
    refreshInbox: async () => {
      refreshCalls += 1;
    },
    refreshPrdState: async () => {
      refreshCalls += 1;
    }
  });

  assert.deepEqual(await action.run(), {
    kind: "failure",
    message: "PRD change could not be created.",
    technicalDetails: "conversion rejected"
  });
  assert.equal(refreshCalls, 0);
});

test("TicketDetailPage conversion button wires click behavior to the governed action", async () => {
  let resolvePost;
  let postCalls = 0;
  let inboxRefreshCalls = 0;
  let prdRefreshCalls = 0;
  const outcomes = [];
  const pending = [];
  const conversion = createTicketPrdChangeAction({
    projectId: "proj_1",
    ticket,
    client: {
      convertTicketToPrdChange: async () => {
        postCalls += 1;
        await new Promise((resolve) => {
          resolvePost = resolve;
        });
      }
    },
    refreshInbox: async () => {
      inboxRefreshCalls += 1;
      throw new Error("inbox refresh unavailable");
    },
    refreshPrdState: async () => {
      prdRefreshCalls += 1;
    }
  });
  const button = TicketDetailConversionButton({
    conversion,
    isConverting: false,
    disabled: false,
    onOutcome: (outcome) => outcomes.push(outcome),
    onPendingChange: (value) => pending.push(value)
  });

  const firstClick = button.props.onClick();
  const secondClick = button.props.onClick();
  assert.equal(postCalls, 1);
  resolvePost();
  await Promise.all([firstClick, secondClick]);
  assert.deepEqual(pending, [true, false]);
  assert.deepEqual(outcomes, [
    {
      kind: "partial-success",
      message: "PRD change was created, but the latest governed state could not be loaded.",
      technicalDetails: "inbox refresh unavailable"
    }
  ]);
  assert.equal(inboxRefreshCalls, 1);
  assert.equal(prdRefreshCalls, 1);
});

test("TicketDetailPage conversion button leaves refreshes untouched after POST failure", async () => {
  let refreshCalls = 0;
  const outcomes = [];
  const button = TicketDetailConversionButton({
    conversion: createTicketPrdChangeAction({
      projectId: "proj_1",
      ticket,
      client: {
        convertTicketToPrdChange: async () => {
          throw new Error("conversion rejected");
        }
      },
      refreshInbox: async () => {
        refreshCalls += 1;
      },
      refreshPrdState: async () => {
        refreshCalls += 1;
      }
    }),
    isConverting: false,
    disabled: false,
    onOutcome: (outcome) => outcomes.push(outcome),
    onPendingChange() {}
  });

  await button.props.onClick();
  assert.equal(refreshCalls, 0);
  assert.deepEqual(outcomes, [
    {
      kind: "failure",
      message: "PRD change could not be created.",
      technicalDetails: "conversion rejected"
    }
  ]);
});

test("ticket detail exposes API-backed conversion and disabled unsupported actions", () => {
  const page = readFileSync("apps/creator-web/src/features/tickets/TicketDetailPage.tsx", "utf8");
  const actions = readFileSync("apps/creator-web/src/features/tickets/ticket-actions.ts", "utf8");
  const button = readFileSync(
    "apps/creator-web/src/features/tickets/TicketDetailConversionButton.tsx",
    "utf8"
  );
  assert.match(button, /Convert to PRD Change/);
  assert.match(page, /Platform API support required/);
  assert.match(actions, /convertTicketToPrdChange/);
  assert.match(page, /items\.find\(\(item\) => item\.id === ticketId\)/);
  assert.match(actions, /ticket\.description \|\| ticket\.title/);
  assert.match(actions, /Promise\.all\(\[refreshInbox\(\), refreshPrdState\(projectId\)\]\)/);
  assert.match(page, /isConverting/);
});

test("ticket inbox navigates to an encoded detail route and exposes refresh", () => {
  const inbox = readFileSync(
    "apps/creator-web/src/features/tickets/use-creator-ticket-inbox.ts",
    "utf8"
  );
  const page = readFileSync("apps/creator-web/src/features/tickets/TicketsPage.tsx", "utf8");
  assert.match(inbox, /const refresh = useCallback\(async \(\): Promise<void>/);
  assert.match(page, /encodeURIComponent\(ticket\.id\)/);
  assert.match(page, /navigateBrowserPath/);
});

test("platform API client converts a Creator ticket into a PRD change", async () => {
  const requests = [];
  const client = createPlatformApiClient({
    baseUrl: "",
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(
        JSON.stringify(
          success({
            id: "prdchg_1",
            projectId: "proj_1",
            sourceType: "ticket",
            sourceTicketId: "ticket_1",
            title: "Address Store feedback",
            proposedRequirement: "Resolve the reported Store issue.",
            affectedSections: ["functional_requirements"],
            acceptanceCriteria: ["The reported workflow succeeds."],
            riskLevel: "medium",
            status: "pending_approval",
            requestedByUserId: "creator_1",
            createdAt: "2026-07-29T00:00:00.000Z",
            updatedAt: "2026-07-29T00:00:00.000Z"
          })
        ),
        { status: 201 }
      );
    }
  });

  await client.convertTicketToPrdChange("proj_1", {
    ticketId: "ticket_1",
    title: "Address Store feedback",
    proposedRequirement: "Resolve the reported Store issue.",
    affectedSections: ["functional_requirements"],
    acceptanceCriteria: ["The reported workflow succeeds."],
    riskLevel: "medium"
  });

  assert.equal(requests[0].url, "/creator/projects/proj_1/prd/changes/from-ticket");
  assert.equal(requests[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), {
    ticketId: "ticket_1",
    title: "Address Store feedback",
    proposedRequirement: "Resolve the reported Store issue.",
    affectedSections: ["functional_requirements"],
    acceptanceCriteria: ["The reported workflow succeeds."],
    riskLevel: "medium"
  });
});
