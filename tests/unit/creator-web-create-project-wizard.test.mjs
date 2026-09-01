import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
const { CreateProjectWizard } =
  await import("../../apps/creator-web/src/features/projects/CreateProjectWizard.tsx");

const form = {
  name: "",
  appType: "Workflow App",
  targetDepartment: "",
  businessProblem: "",
  intendedUsers: "",
  dataSensitivity: "internal"
};

test("CreateProjectWizard renders primitive controls (Field/Input/Textarea/Button) without throwing", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreateProjectWizard, {
      form,
      onField: () => {},
      onSubmit: () => {},
      onClose: () => {},
      message: "Ready",
      isCreating: false
    })
  );
  assert.match(html, />Create project</);
  assert.match(html, /Project history remains available for later PRD review/);
  assert.match(html, /<textarea/);
  assert.match(html, /focus:ring-primary-soft/);
  assert.match(html, /Project name/);
  assert.match(html, /Data sensitivity/);
});

test("CreateProjectWizard keeps backend failures behind technical details", () => {
  const html = renderToStaticMarkup(
    React.createElement(CreateProjectWizard, {
      form,
      onField: () => {},
      onSubmit: () => {},
      onClose: () => {},
      message: "Project could not be created. Review the details and try again.",
      technicalDetails: "SQLSTATE 23505 projects_name_key",
      isCreating: false
    })
  );
  assert.match(html, /creator-status-message-danger/);
  assert.match(html, /Project could not be created\. Review the details and try again\./);
  assert.match(html, /Technical details/);
  assert.match(html, /SQLSTATE 23505 projects_name_key/);
  assert.doesNotMatch(html, /<strong>SQLSTATE 23505 projects_name_key<\/strong>/);
});
