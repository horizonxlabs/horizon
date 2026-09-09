import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublishDeploymentCard } from "../../apps/creator-web/src/features/publish/PublishDeploymentCard.tsx";

globalThis.React = React;

const deployment = {
  id: "deployment-1",
  status: "published",
  environment: "production",
  manifestVersion: "3",
  subdomainUrl: "https://calculator.apps.example.test",
  route: "/apps/calculator"
};

function render(isPublishing, value = deployment) {
  return renderToStaticMarkup(
    React.createElement(PublishDeploymentCard, { isPublishing, deployment: value })
  );
}

test("publishing replaces an older deployment link with accessible loading feedback", () => {
  const html = render(true);
  assert.match(html, /role="status"/);
  assert.match(html, /creator-state-spinner/);
  assert.match(html, /Building &amp; deploying your app/);
  assert.doesNotMatch(html, /Open app|Your app is ready|No published deployment yet/);
  assert.doesNotMatch(html, /href=/);
});

test("a completed publish offers the backend subdomain in a new tab", () => {
  const html = render(false);
  assert.match(html, /Your app is ready/);
  assert.match(
    html,
    /href="https:\/\/calculator.apps.example.test" target="_blank" rel="noopener noreferrer">Open app/
  );
  assert.match(html, /Fallback path/);
  assert.doesNotMatch(html, /creator-state-spinner|Building &amp; deploying/);
});

test("healthy persisted deployments use their route when no subdomain is available", () => {
  const html = render(false, { ...deployment, status: "healthy", subdomainUrl: undefined });
  assert.match(
    html,
    /href="\/apps\/calculator" target="_blank" rel="noopener noreferrer">Open app/
  );
});

test("failed or pending deployments never offer a ready badge or launch link", () => {
  for (const status of ["failed", "pending", "building"]) {
    const html = render(false, { ...deployment, status });
    assert.match(html, /Deployment is not ready/);
    assert.doesNotMatch(html, /Your app is ready|Open app|href=/);
  }
});

test("a project without deployment evidence has no ready badge or launch link", () => {
  const html = render(false, null);
  assert.match(html, /No published deployment yet/);
  assert.doesNotMatch(html, /Your app is ready|Open app|href=/);
});
