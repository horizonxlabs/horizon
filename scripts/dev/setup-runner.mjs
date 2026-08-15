export function runStartupCommands({
  ensureEnv,
  runPreflight,
  buildWorkspaceImage,
  prepareCompose,
  startCompose
}) {
  ensureEnv();
  runPreflight();
  buildWorkspaceImage();
  prepareCompose();
  startCompose();
}
