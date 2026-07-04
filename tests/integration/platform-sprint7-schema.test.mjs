import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const schema = readFileSync("apps/platform-api/prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "apps/platform-api/prisma/migrations/20260703000006_sprint7_store_ticket/migration.sql",
  "utf8"
);
const seed = readFileSync("apps/platform-api/prisma/seed.ts", "utf8");

test("Sprint 7 Prisma schema defines support ticket timeline and notification models", () => {
  for (const model of ["SupportTicket", "SupportTicketTimelineEntry", "InAppNotification"]) {
    assert.match(schema, new RegExp(`model ${model}\\b`), `${model} model should exist`);
  }

  assert.match(schema, /ticketsSubmitted\s+SupportTicket/);
  assert.match(schema, /timeline\s+SupportTicketTimelineEntry/);
  assert.match(schema, /notifications\s+InAppNotification/);
});

test("Sprint 7 migration creates ticket timeline and notification tables", () => {
  for (const table of ["support_tickets", "support_ticket_timeline_entries", "in_app_notifications"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`), `${table} should be created`);
  }

  assert.match(migration, /ticket_number/);
  assert.match(migration, /device_info/);
  assert.match(migration, /convert_to_prd_change/);
});

test("Sprint 7 seed includes ticket status and notification demo data", () => {
  for (const token of [
    "supportTicket",
    "supportTicketTimelineEntry",
    "inAppNotification",
    "TKT-0001",
    "ticket_leave_management_bug_001"
  ]) {
    assert.match(seed, new RegExp(token));
  }
});
