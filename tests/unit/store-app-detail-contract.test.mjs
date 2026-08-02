import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Store app cards link to Store detail before generated runtime", () => {
  const source = readFileSync("packages/ui/src/index.tsx", "utf8");
  assert.match(source, /detailRoute/);
  assert.match(source, /href={detailRoute}/);
});

test("Store app detail owns open install remove access and ticket actions", () => {
  const source = readFileSync(
    "apps/app-store-pwa/src/features/storefront/pages/StoreAppDetailPage.tsx",
    "utf8"
  );
  for (const action of [
    "getStoreAppDetail",
    "installStoreApp",
    "uninstallStoreApp",
    "requestStoreAccess",
    "submitStoreTicket",
    "recordRecent"
  ]) assert.match(source, new RegExp(action));
});
