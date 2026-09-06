import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const creatorSourceRoot = "apps/creator-web/src";
async function listProductionSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return listProductionSources(file);
      return /\.(?:ts|tsx)$/.test(entry.name) && entry.name !== "vite-env.d.ts" ? [file] : [];
    })
  );
  return nested.flat().sort();
}

async function readRepoFile(file) {
  return readFile(new URL(`../../${file}`, import.meta.url), "utf8");
}

test("authenticated Creator route sources contain no Thai user-facing copy", async () => {
  const productionSources = await listProductionSources(creatorSourceRoot);
  const authenticatedCreatorFiles = productionSources;
  assert.ok(
    authenticatedCreatorFiles.length > 70,
    "audit must enumerate the production Creator tree"
  );
  for (const file of authenticatedCreatorFiles) {
    assert.doesNotMatch(await readRepoFile(file), /[\u0E00-\u0E7F]/, file);
  }
});

test("bootstrap and create-project failures keep backend errors out of primary copy", async () => {
  const app = await readRepoFile("apps/creator-web/src/app/use-creator-app.tsx");
  const routes = await readRepoFile("apps/creator-web/src/routes/CreatorRoutes.tsx");
  const wizard = await readRepoFile(
    "apps/creator-web/src/features/projects/CreateProjectWizard.tsx"
  );

  assert.doesNotMatch(app, /Create project failed:\s*\$\{error\.message\}/);
  assert.doesNotMatch(app, /setCreateProjectMessage\(\s*error instanceof Error \? error\.message/);
  assert.match(app, /setCreateProjectTechnicalDetails/);
  assert.match(routes, /<CreatorState/);
  assert.match(routes, /technicalDetails=\{app\.bootstrap\.technicalDetails\}/);
  assert.doesNotMatch(routes, /<p role="alert">\{app\.bootstrap\.message\}<\/p>/);
  assert.match(wizard, /<CreatorStatusMessage/);
  assert.match(wizard, /technicalDetails=\{technicalDetails\}/);
});

test("Workspace failures keep service exceptions out of primary authenticated copy", async () => {
  const vibeChat = await readRepoFile("apps/creator-web/src/features/workspace/use-vibe-chat.ts");
  const codePanel = await readRepoFile(
    "apps/creator-web/src/features/workspace/WorkspaceCodePanel.tsx"
  );
  const restorePoint = await readRepoFile(
    "apps/creator-web/src/features/workspace/VibeRestorePoint.tsx"
  );
  const projectFiles = await readRepoFile(
    "apps/creator-web/src/features/workspace/use-project-files.ts"
  );

  assert.doesNotMatch(vibeChat, /text:\s*message\.text\s*\+[\s\S]{0,160}\.message/);
  assert.doesNotMatch(codePanel, /<span>\{errorText\}<\/span>/);
  assert.doesNotMatch(restorePoint, /vibe-restore-error[^>]*>\{error\}/);
  assert.doesNotMatch(projectFiles, /setProjectFileMessage\([^)]*\.message/);
  for (const source of [vibeChat, codePanel, restorePoint, projectFiles]) {
    assert.match(source, /[Tt]echnicalDetails/);
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

  assert.match(prd, /ariaLabel="Project note version history"/);
  assert.match(deployments, /ariaLabel="Project deployments"/);
  for (const label of [
    "Project members",
    "Pending invitations",
    "Access requests",
    "Application roles"
  ]) {
    assert.match(users, new RegExp(`ariaLabel="${label}"`));
  }
  assert.match(database, /aria-label="Database tables" role="region" tabIndex=\{0\}/);
  assert.match(database, /aria-label=\{`Records in \$\{activeTable\}`\}/);
});
