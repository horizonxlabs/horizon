import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { ProviderCard } = await import(
  "../../apps/admin-web/src/features/ai-governance/ProviderCard.tsx"
);

test("provider card header shrinks the long baseUrl instead of pushing badges out of the card", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProviderCard, {
      provider: {
        id: "aip_google_image",
        name: "Google Gemini Images",
        adapter: "google",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        models: ["gemini-2.5-flash-image"],
        status: "active",
        createdAt: "2026-08-16T00:00:00.000Z"
      },
      credentials: [],
      routedScenarios: ["image_generation"],
      onAddCredential() {},
      onSetStatus() {},
      onEdit() {},
      onDelete() {}
    })
  );
  // The name/url column must be allowed to shrink (min-w-0) or `truncate` never engages
  // and the flex child's intrinsic width shoves the badge column outside the card.
  assert.match(html, /class="[^"]*min-w-0[^"]*flex-col/);
  // The badge column must never be squeezed to wrap outside; it opts out of shrinking.
  assert.match(html, /class="[^"]*shrink-0[^"]*items-center/);
  // Full URL stays discoverable via tooltip once truncated.
  assert.match(html, /title="https:\/\/generativelanguage\.googleapis\.com\/v1beta"/);
});
