import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const authenticatedCreatorFiles = [
  "apps/creator-web/src/app/routes.ts",
  "apps/creator-web/src/features/projects/CreatorShell.tsx",
  "apps/creator-web/src/features/projects/ProjectSwitcher.tsx",
  "apps/creator-web/src/features/projects/CreateProjectWizard.tsx",
  "apps/creator-web/src/features/projects/ProjectsPage.tsx",
  "apps/creator-web/src/features/project-overview/ProjectOverviewPage.tsx",
  "apps/creator-web/src/features/workspace/WorkspacePage.tsx",
  "apps/creator-web/src/features/workspace/QuickMessages.tsx",
  "apps/creator-web/src/features/workspace/workspace-chrome.ts",
  "apps/creator-web/src/features/prd/PrdPage.tsx",
  "apps/creator-web/src/features/database/DatabasePage.tsx",
  "apps/creator-web/src/features/versions/VersionsPage.tsx",
  "apps/creator-web/src/features/users/UsersPage.tsx",
  "apps/creator-web/src/features/publish/PublishPage.tsx",
  "apps/creator-web/src/features/deployments/DeploymentsPage.tsx",
  "apps/creator-web/src/features/tickets/TicketsPage.tsx",
  "apps/creator-web/src/features/tickets/TicketDetailPage.tsx",
  "apps/creator-web/src/features/project-settings/ProjectSettingsPage.tsx"
];

async function readRepoFile(file) {
  return readFile(new URL(`../../${file}`, import.meta.url), "utf8");
}

test("authenticated Creator route sources contain no Thai user-facing copy", async () => {
  for (const file of authenticatedCreatorFiles) {
    assert.doesNotMatch(await readRepoFile(file), /[\u0E00-\u0E7F]/, file);
  }
});

test("table-heavy Creator surfaces keep named, keyboard-reachable data regions", async () => {
  const prd = await readRepoFile("apps/creator-web/src/features/prd/PrdPage.tsx");
  const deployments = await readRepoFile(
    "apps/creator-web/src/features/deployments/DeploymentsPage.tsx"
  );
  const users = await readRepoFile("apps/creator-web/src/features/users/UsersPage.tsx");
  const database = await readRepoFile(
    "apps/creator-web/src/features/workspace/WorkspaceDatabasePanel.tsx"
  );

  assert.match(prd, /ariaLabel="PRD version history"/);
  assert.match(deployments, /ariaLabel="Project deployments"/);
  for (const label of [
    "Project members",
    "Pending invitations",
    "Access requests",
    "Application roles"
  ]) {
    assert.match(users, new RegExp(`ariaLabel="${label}"`));
  }
  assert.match(
    database,
    /aria-label="Database tables" role="region" tabIndex=\{0\}/
  );
  assert.match(database, /aria-label=\{`Records in \$\{activeTable\}`\}/);
});
