import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;

const { PrdPage } = await import("../../apps/creator-web/src/features/prd/PrdPage.tsx");
const { creatorPageCopy } = await import("../../apps/creator-web/src/app/routes.ts");

const project = {
  id: "operations-hub",
  name: "Operations Hub",
  owner: "Creator",
  status: "in_review",
  createdAt: "2026-08-24T00:00:00.000Z"
};

function prdApp(overrides = {}) {
  return {
    creatorNavItems: [],
    bootstrap: { projects: [project], userName: "Creator", status: "ready" },
    creatorSessionControls: null,
    creatorPage: "prd",
    creatorRoute: { page: "prd", projectId: project.id },
    pageCopy: creatorPageCopy.prd,
    selectedProject: project,
    creatorPageActions: null,
    isCreateProjectDialogOpen: false,
    setIsCreateProjectDialogOpen: () => undefined,
    handleCreateProjectSubmit: () => undefined,
    isCreatingProject: false,
    createProjectForm: {},
    handleCreateProjectField: () => undefined,
    createProjectMessage: "",
    isEnteringWorkspace: false,
    handleSelectProject: async () => undefined,
    onNavigate: () => undefined,
    pathname: `/creator/projects/${project.id}/prd`,
    visiblePrdSections: [],
    visibleVersionRows: [],
    currentPrdVersion: undefined,
    prdStatus: "empty",
    prdMessage: "No docs yet.",
    prdTechnicalDetails: undefined,
    prdErrorSource: undefined,
    prdFeedbackTone: undefined,
    isGeneratingPrdDraft: false,
    handleConfirmPrdBaseline: async () => undefined,
    handleGeneratePrdDraft: async () => undefined,
    refreshPrdState: async () => undefined,
    ...overrides
  };
}

function renderPrd(overrides) {
  return renderToStaticMarkup(React.createElement(PrdPage, { app: prdApp(overrides) }));
}

test("AI project notes use one semantic state for loading, empty, and unavailable outcomes", () => {
  const loading = renderPrd({ prdStatus: "loading" });
  assert.match(loading, /creator-state-loading/);
  assert.match(loading, /Loading docs/);
  assert.doesNotMatch(loading, /Loading PRD state from Platform API/);

  const empty = renderPrd({ prdStatus: "empty" });
  assert.match(empty, /creator-empty-state/);
  assert.match(empty, /No docs yet/);
  assert.match(empty, /optional/i);
  assert.equal((empty.match(/Generate docs/g) ?? []).length, 1);

  const unavailable = renderPrd({
    prdStatus: "error",
    prdMessage: "Project notes could not be loaded.",
    prdTechnicalDetails: "HTTP 503 from PRD service"
  });
  assert.match(unavailable, /creator-state-unavailable/);
  assert.match(unavailable, /Project notes could not be loaded/);
  assert.match(unavailable, /Retry/);
  assert.match(unavailable, /Technical details/);
  assert.match(unavailable, /HTTP 503 from PRD service/);
});

test("AI note generation and saved feedback use semantic shared states", () => {
  const generating = renderPrd({ prdStatus: "empty", isGeneratingPrdDraft: true });
  assert.match(generating, /creator-state-loading/);
  assert.match(generating, /Generating docs/);

  const ready = renderPrd({
    prdStatus: "ready",
    currentPrdVersion: { id: "prd-1", version: "1.0", status: "baseline" },
    prdMessage: "Document v1.0 saved.",
    prdFeedbackTone: "success",
    visiblePrdSections: [{ key: "overview", order: "1", title: "Overview", body: "Ready" }]
  });
  assert.match(ready, /creator-status-message-success/);
  assert.match(ready, /Document v1.0 saved/);
  assert.doesNotMatch(ready, /Confirm Baseline/);
});

test("PrdPage renders PRD section bodies as Markdown", () => {
  const html = renderPrd({
    prdStatus: "ready",
    currentPrdVersion: { id: "prd-1", version: "0.1", status: "draft" },
    visiblePrdSections: [
      {
        key: "overview",
        order: 1,
        title: "Overview",
        body: [
          "## Workflow",
          "",
          "**Owners** review the queue.",
          "",
          "| Role | Action |",
          "| --- | --- |",
          "| Admin | Approve |"
        ].join("\n")
      }
    ]
  });
  assert.match(html, /vibe-md-h2/);
  assert.match(html, /<strong>Owners<\/strong>/);
  assert.match(html, /vibe-md-table/);
  assert.match(html, /<th>Role<\/th>/);
  assert.match(html, /<td>Approve<\/td>/);
});

test("PrdPage offers API-backed optional note generation with the Button primitive", () => {
  const html = renderPrd({ prdStatus: "empty" });
  assert.match(html, /<button[^>]*class="[^"]+"[^>]*>Generate docs<\/button>/);
});
