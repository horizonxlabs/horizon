import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiClient, success } = await import("../../packages/api-client/src/index.ts");

test("platform API client reads App Store app detail", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "user@company.com",
    fetcher: async (url, init) => {
      assert.equal(String(url), "https://platform.example/api/store/apps/leave-management");
      assert.equal(init.headers.get("x-mock-user-email"), "user@company.com");
      return new Response(
        JSON.stringify(
          success({
            id: "reg_leave",
            appId: "app_leave",
            projectId: "prj_leave",
            slug: "leave-management",
            name: "Leave Management",
            ownerName: "Creator User",
            accessStatus: "active",
            myRole: "Employee",
            health: "healthy",
            version: "manifest v1",
            actions: ["open", "submit_ticket"]
          })
        ),
        { status: 200 }
      );
    }
  });

  const detail = await client.getStoreAppDetail("leave-management");

  assert.equal(detail.slug, "leave-management");
  assert.equal(detail.myRole, "Employee");
});

test("platform API client authorizes a browser launch session before opening an app", async () => {
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "user@company.com",
    fetcher: async (url, init) => {
      assert.equal(
        String(url),
        "https://platform.example/api/store/apps/leave-management/launch-session"
      );
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(String(init.body)), { routePath: "/apps/leave-management" });
      return new Response(JSON.stringify(success({ authorized: true })), { status: 200 });
    }
  });

  assert.deepEqual(
    await client.authorizeStoreAppLaunch("leave-management", "/apps/leave-management"),
    { authorized: true }
  );
});

test("platform API client requests App Store access", async () => {
  let observedBody = {};
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    legacyUserEmail: "user@company.com",
    fetcher: async (url, init) => {
      assert.equal(
        String(url),
        "https://platform.example/api/store/apps/leave-management/access-requests"
      );
      observedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify(
          success({
            id: "areq_0001",
            appSlug: "leave-management",
            requestedRoleKey: "manager",
            requesterEmail: "user@company.com",
            status: "pending",
            reason: "Need approval access",
            department: "HR",
            createdAt: "2026-07-04T01:00:00.000Z"
          })
        ),
        { status: 201 }
      );
    }
  });

  const request = await client.requestStoreAccess("leave-management", {
    requestedRoleKey: "manager",
    reason: "Need approval access",
    department: "HR"
  });

  assert.equal(observedBody.requestedRoleKey, "manager");
  assert.equal(request.status, "pending");
  assert.equal(request.requesterEmail, "user@company.com");
});

test("platform API client submits App Store tickets and reads ticket status", async () => {
  const seenUrls = [];
  const client = createPlatformApiClient({
    baseUrl: "https://platform.example/api",
    sessionToken: "evcp_session.payload.signature",
    fetcher: async (url, init) => {
      seenUrls.push(String(url));
      assert.equal(init.headers.get("authorization"), "Bearer evcp_session.payload.signature");
      if (String(url).endsWith("/tickets")) {
        const body = JSON.parse(String(init.body));
        assert.equal(body.title, "WFH leave type missing");
        return new Response(
          JSON.stringify(
            success({
              id: "ticket_0001",
              ticketNumber: "TKT-0001",
              appSlug: "leave-management",
              type: "bug",
              priority: "high",
              title: "WFH leave type missing",
              description: "The WFH option is not visible on mobile.",
              deviceInfo: "iPhone Safari",
              status: "submitted",
              timeline: [{ id: "tl_001", status: "submitted", label: "Ticket submitted" }]
            })
          ),
          { status: 201 }
        );
      }
      return new Response(
        JSON.stringify(
          success({
            id: "ticket_0001",
            ticketNumber: "TKT-0001",
            appSlug: "leave-management",
            appName: "Leave Management",
            status: "submitted",
            timeline: [{ id: "tl_001", status: "submitted", label: "Ticket submitted" }]
          })
        ),
        { status: 200 }
      );
    }
  });

  const ticket = await client.submitStoreTicket("leave-management", {
    type: "bug",
    priority: "high",
    title: "WFH leave type missing",
    description: "The WFH option is not visible on mobile.",
    deviceInfo: "iPhone Safari"
  });
  const status = await client.getStoreTicket(ticket.id);

  assert.deepEqual(seenUrls, [
    "https://platform.example/api/store/apps/leave-management/tickets",
    "https://platform.example/api/store/tickets/ticket_0001"
  ]);
  assert.equal(status.ticketNumber, "TKT-0001");
  assert.equal(status.timeline[0].status, "submitted");
});
