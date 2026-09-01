import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { CreatorRoutes } = await import("../../apps/creator-web/src/routes/CreatorRoutes.tsx");

test("CreatorRoutes keeps bootstrap service errors behind technical details", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreatorRoutes, {
      app: {
        bootstrap: {
          status: "error",
          message: "Creator projects could not be loaded.",
          technicalDetails: "database connection password=secret failed"
        }
      }
    })
  );

  assert.match(html, /creator-state-unavailable/);
  assert.match(html, /Creator projects could not be loaded\./);
  assert.match(html, /Your projects have not changed/);
  assert.match(html, /Technical details/);
  assert.match(html, /database connection password=secret failed/);
  assert.doesNotMatch(html, /<h1>database connection password=secret failed<\/h1>/);
  assert.doesNotMatch(html, /<p role="alert">database connection password=secret failed<\/p>/);
});
