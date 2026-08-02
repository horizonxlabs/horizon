export function runStartupCommands({ ensureEnv, runPreflight, prepareCompose, startCompose }) {
  ensureEnv();
  runPreflight();
  prepareCompose();
  startCompose();
}
