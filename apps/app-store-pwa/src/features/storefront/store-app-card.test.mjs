import assert from "node:assert/strict";
import test from "node:test";
import { storeAppAccent, storeAppCardAction } from "./store-app-card.ts";

const app = (accessStatus, route = "/apps/payroll", health = "healthy") => ({
  slug: "payroll",
  accessStatus,
  route,
  health
});

test("active healthy web apps open directly", () =>
  assert.deepEqual(storeAppCardAction(app("active")), {
    kind: "open",
    label: "Open app",
    href: "/apps/payroll"
  }));

test("pending apps link to request evidence", () =>
  assert.deepEqual(storeAppCardAction(app("pending")), {
    kind: "status",
    label: "View request",
    href: "/store/access-requests"
  }));

test("available apps expose request intent through detail", () =>
  assert.deepEqual(storeAppCardAction(app("available")), {
    kind: "request",
    label: "Request access",
    href: "/store/apps/payroll"
  }));

test("unhealthy active apps fall back to detail", () =>
  assert.equal(storeAppCardAction(app("active", "/apps/payroll", "unhealthy")).kind, "detail"));

test("accent is deterministic", () =>
  assert.equal(storeAppAccent("payroll"), storeAppAccent("payroll")));
