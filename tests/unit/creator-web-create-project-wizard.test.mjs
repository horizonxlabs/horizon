import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
globalThis.React = React;
const { CreateProjectWizard } = await import(
  "../../apps/creator-web/src/features/projects/CreateProjectWizard.tsx"
);

const form = { name: "", appType: "Workflow App", targetDepartment: "", businessProblem: "", intendedUsers: "", dataSensitivity: "internal" };

test("CreateProjectWizard keeps project creation focused on its name and business problem", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreateProjectWizard, {
      form, onField: () => {}, onSubmit: () => {}, onClose: () => {}, message: "Ready", isCreating: false
    })
  );
  assert.match(html, />Create Project</);
  assert.match(html, /<textarea/);
  assert.match(html, /focus:ring-primary-soft/);
  assert.match(html, /Project name/);
  assert.match(html, /Business problem/);
  assert.doesNotMatch(html, /App type|Target department|Intended users|Data sensitivity/);
  assert.doesNotMatch(html, /POST \/projects|chat history.*บันทึกโครงการ/);
});
