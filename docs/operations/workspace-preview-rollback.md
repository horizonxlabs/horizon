# Preview returns 404 after a failed generation turn

A failed turn restores the protected pre-turn source snapshot. Deleting and recreating the
source directories during that restoration invalidates the running Next.js dev server's
directory watches. The workspace remains `running`, and its files and database are intact,
but both its page and API routes can return Next.js 404 responses.

Snapshot restoration now retains directories recorded in the protected manifest while
replacing their contents and removing entries introduced by the failed turn. Dependencies,
Next build output, and Git metadata retain their existing exclusions. Symlinks are removed
without following their targets, and snapshot permissions are reapplied after extraction.

Creator history also distinguishes failed tool attempts from the final turn outcome. A
committed turn can display Completed after successful recovery while preserving failed
attempts in the activity log. An explicit turn error still displays Failed, including when
a candidate commit was preserved after a finalization error.

## Recover an already affected workspace

Deploy the platform-api fix to prevent subsequent rollbacks from recreating this problem,
and the creator-web fix to correct the restored outcome display. Updating platform-api alone
does not restart existing workspace containers.

For an affected workspace, wait until no generation turn is active, identify its container
from the project's workspace record, and restart only that container with `docker restart`.
This reloads Next's route watches using the existing workspace files. Refresh the Creator
preview and verify both the page and a known application API route. Confirm the Database
panel still reads the project's tables. A 200 from the Database panel alone does not verify
the generated application's API connection.

## Regression evidence

The live test starts the normal workspace image, verifies its page and health API, then
executes the production snapshot prepare/restore/release code while Next keeps running.
Before the fix both routes returned 404; with the fix both return 200, and the temporary
failed-turn file is removed.

```sh
EVCP_GIT_LIVE=1 EVCP_WORKSPACE_IMAGE=evcp/workspace-next:1 \
  node --import tsx --test tests/integration/workspace-preview-rollback-live.test.mjs
```

History hydration is covered by `tests/unit/creator-workspace-history-outcome.test.mjs`,
including preservation of failed activity entries without showing the workspace retry banner.
