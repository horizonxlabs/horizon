export async function waitForWorkspaceLiveIdle(pool, pendingProvisions, pendingRefills) {
  await Promise.allSettled(pendingProvisions);
  await Promise.allSettled(pendingRefills);
  await pool?.waitForIdle();
}
