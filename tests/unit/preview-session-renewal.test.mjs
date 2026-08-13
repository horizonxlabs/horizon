import test from "node:test";
import assert from "node:assert/strict";
const { renderPreviewUnavailableHtml } = await import(
  "../../apps/platform-api/src/workspace-orchestrator/preview-unavailable-page.ts"
);
const {
  PREVIEW_UNAUTHORIZED_MESSAGE_TYPE,
  PREVIEW_REAUTHORIZE_INTERVAL_MS,
  isPreviewUnauthorizedMessage
} = await import("../../apps/creator-web/src/features/workspace/preview-session.ts");

test("401 preview page tells the parent frame to renew the session", () => {
  const html = renderPreviewUnavailableHtml({ status: 401 });
  assert.match(html, /postMessage/);
  assert.match(html, new RegExp(PREVIEW_UNAUTHORIZED_MESSAGE_TYPE));
  assert.match(html, /authorization/i);
  assert.doesNotMatch(html, /still starting/i);
  // meta refresh stays as the recovery path once the parent has renewed the cookie
  assert.match(html, /http-equiv="refresh"/);
});

test("503 preview page keeps the starting message and never signals unauthorized", () => {
  const html = renderPreviewUnavailableHtml({ status: 503 });
  assert.match(html, /Starting workspace preview/);
  assert.match(html, /still starting/i);
  assert.doesNotMatch(html, new RegExp(PREVIEW_UNAUTHORIZED_MESSAGE_TYPE));
});

test("unauthorized message guard accepts only the typed message", () => {
  assert.equal(isPreviewUnauthorizedMessage({ type: PREVIEW_UNAUTHORIZED_MESSAGE_TYPE }), true);
  assert.equal(isPreviewUnauthorizedMessage({ type: "other" }), false);
  assert.equal(isPreviewUnauthorizedMessage("evcp:preview-unauthorized"), false);
  assert.equal(isPreviewUnauthorizedMessage(null), false);
  assert.equal(isPreviewUnauthorizedMessage(undefined), false);
});

test("keepalive renews well before the 15-minute preview cookie expires", () => {
  const cookieMaxAgeMs = 900 * 1000;
  assert.ok(PREVIEW_REAUTHORIZE_INTERVAL_MS < cookieMaxAgeMs);
  assert.ok(PREVIEW_REAUTHORIZE_INTERVAL_MS >= 60 * 1000);
});
