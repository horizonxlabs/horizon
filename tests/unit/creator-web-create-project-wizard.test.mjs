import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
const { CreateProjectWizard } = await import(
  "../../apps/creator-web/src/features/projects/CreateProjectWizard.tsx"
);

const form = { name: "", appType: "Workflow App", targetDepartment: "", businessProblem: "", intendedUsers: "", dataSensitivity: "internal" };

test("CreateProjectWizard renders primitive controls (Field/Input/Textarea/Button) without throwing", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreateProjectWizard, {
      form, onField: () => {}, onSubmit: () => {}, onClose: () => {}, message: "Ready", isCreating: false
    })
  );
  assert.match(html, />Create project</);
  assert.match(html, /Project history remains available for later PRD review/);
  assert.match(html, /<textarea/);
  assert.match(html, /focus:ring-primary-soft/);
  assert.match(html, /Project name/);
  assert.match(html, /Data sensitivity/);
});
