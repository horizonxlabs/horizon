import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { DomainReadinessPage } =
  await import("../../apps/admin-web/src/features/domain-management/DomainReadinessPage.tsx");
const { PublishGovernancePage } =
  await import("../../apps/admin-web/src/features/publish-governance/PublishGovernancePage.tsx");

test("Domain page shows approvals without the static readiness explanation", () => {
  const html = renderToStaticMarkup(React.createElement(DomainReadinessPage));

  assert.match(html, /Domain request approvals/);
  assert.doesNotMatch(html, /Static domain approval evidence/);
  assert.doesNotMatch(
    html,
    /These exported records are readiness evidence, not live domain or DNS settings\./
  );
});

test("Publishing page shows change signals without the static readiness explanation", () => {
  const html = renderToStaticMarkup(React.createElement(PublishGovernancePage));

  assert.match(html, /Publishing change signals/);
  assert.doesNotMatch(html, /Static publishing governance evidence/);
  assert.doesNotMatch(
    html,
    /These exported records are readiness evidence, not live publishing or ticket settings\./
  );
});
