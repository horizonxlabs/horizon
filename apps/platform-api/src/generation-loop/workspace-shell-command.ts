import type { RunnableAction } from "./action-runner-types";

type ShellAction = Extract<RunnableAction, { type: "shell" }>;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function isWorkspaceBuildCommand(action: ShellAction): boolean {
  const parts = action.args ? [action.command, ...action.args] : action.command.trim().split(/\s+/);
  return (
    (parts[0] === "npm" && ["build", "run build"].includes(parts.slice(1).join(" "))) ||
    (parts[0] === "pnpm" && ["build", "run build"].includes(parts.slice(1).join(" "))) ||
    (parts[0] === "npx" && parts.slice(1).join(" ") === "next build")
  );
}

export function workspaceShellCommand(action: ShellAction, timeoutMs = 60_000): string[] {
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1_000));
  const hardTimeout = `timeout -s TERM -k 5 ${timeoutSeconds}`;
  if (isWorkspaceBuildCommand(action)) {
    const script = [
      'validation_dir="$(mktemp -d /tmp/evcp-agent-validation.XXXXXX)"',
      `trap 'rm -rf "$validation_dir"' EXIT HUP INT TERM`,
      'tar -C /workspace --exclude=.git --exclude=node_modules --exclude=.next --exclude=.next-* -cf - . | tar -C "$validation_dir" -xf -',
      'ln -s /workspace/node_modules "$validation_dir/node_modules"',
      'cd "$validation_dir"',
      `EVCP_VALIDATION_DIST_DIR=.next ${hardTimeout} ./node_modules/.bin/next build`
    ].join(" && ");
    return ["su", "-s", "/bin/sh", "evcp", "-c", script];
  }
  const command = action.args
    ? [action.command, ...action.args].map(shellQuote).join(" ")
    : `sh -c ${shellQuote(action.command)}`;
  return ["su", "-s", "/bin/sh", "evcp", "-c", `cd /workspace && exec ${hardTimeout} ${command}`];
}
