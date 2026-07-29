import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { createPlatformApiClient, success } = await import("../../packages/api-client/src/index.ts");

test("ticket detail exposes API-backed conversion and disabled unsupported actions", () => {
  const page = readFileSync(
    "apps/creator-web/src/features/tickets/TicketDetailPage.tsx",
    "utf8"
  );
  assert.match(page, /Convert to PRD Change/);
  assert.match(page, /Platform API support required/);
  assert.match(page, /convertTicketToPrdChange/);
  assert.match(page, /items\.find\(\(item\) => item\.id === ticketId\)/);
  assert.match(page, /ticket\.description \|\| ticket\.title/);
  assert.match(page, /await Promise\.all\(\[inbox\.refresh\(\), app\.refreshPrdState\(projectId\)\]\)/);
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
