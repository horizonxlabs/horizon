import type { RunnableAction } from "./action-runner-types";

type ShellAction = Extract<RunnableAction, { type: "shell" }>;

const ACTION_PROCESS_ROOT = "/var/lib/evcp-action-processes";

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

function assertActionToken(actionToken: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionToken)) {
    throw new Error("invalid workspace action token");
  }
}

export function workspaceShellCommand(
  action: ShellAction,
  timeoutMs = 60_000,
  actionToken: string
): string[] {
  assertActionToken(actionToken);
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1_000));
  let actionScript: string;
  if (isWorkspaceBuildCommand(action)) {
    actionScript = [
      'validation_dir="$(mktemp -d /tmp/evcp-agent-validation.XXXXXX)"',
      `trap 'rm -rf "$validation_dir"' EXIT HUP INT TERM`,
      'tar -C /workspace --exclude=.git --exclude=node_modules --exclude=.next --exclude=.next-* -cf - . | tar -C "$validation_dir" -xf -',
      'ln -s /workspace/node_modules "$validation_dir/node_modules"',
      'cd "$validation_dir"',
      "exec env EVCP_VALIDATION_DIST_DIR=.next ./node_modules/.bin/next build"
    ].join(" && ");
  } else {
    const command = action.args
      ? [action.command, ...action.args].map(shellQuote).join(" ")
      : `sh -c ${shellQuote(action.command)}`;
    actionScript = `cd /workspace && exec ${command}`;
  }
  const pgidFile = `${ACTION_PROCESS_ROOT}/${actionToken}.pgid`;
  const sessionScript = [
    `printf "%s\\n" "$$" > ${shellQuote(pgidFile)}`,
    `su -s /bin/sh evcp -c ${shellQuote(actionScript)} &`,
    "action_pid=$!",
    `( sleep ${timeoutSeconds}; kill -TERM "$action_pid" 2>/dev/null || exit 0; sleep 5; kill -KILL "$action_pid" 2>/dev/null || true ) &`,
    "hard_timeout_pid=$!",
    "set +e",
    'wait "$action_pid"',
    "action_status=$?",
    'kill "$hard_timeout_pid" 2>/dev/null || true',
    'wait "$hard_timeout_pid" 2>/dev/null || true',
    'exit "$action_status"'
  ].join("\n");
  const rootScript = [
    "set -eu",
    `action_root=${shellQuote(ACTION_PROCESS_ROOT)}`,
    'action_parent="${action_root%/*}"',
    `action_pgid_file=${shellQuote(pgidFile)}`,
    '[ -d "$action_parent" ] || { echo "workspace action process parent is invalid" >&2; exit 2; }',
    'action_parent_owner="$(stat -Lc \'%u:%g\' "$action_parent" 2>/dev/null || stat -Lf \'%u:%g\' "$action_parent" 2>/dev/null)"',
    'action_parent_mode="$(stat -Lc %a "$action_parent" 2>/dev/null || stat -Lf %Lp "$action_parent" 2>/dev/null)"',
    'case "$action_parent_mode" in \'\'|*[!0-7]*) echo "workspace action process parent is invalid" >&2; exit 2;; esac',
    'action_parent_permissions="$((0$action_parent_mode))"',
    '[ "$action_parent_owner" = "0:0" ] && [ $((action_parent_permissions & 0022)) -eq 0 ] || { echo "workspace action process parent is unsafe" >&2; exit 2; }',
    'if [ ! -e "$action_root" ]; then (umask 077; mkdir "$action_root") 2>/dev/null || true; fi',
    '[ -d "$action_root" ] && [ ! -L "$action_root" ] || { echo "workspace action process root is invalid" >&2; exit 2; }',
    'action_root_owner="$(stat -c \'%u:%g\' "$action_root" 2>/dev/null || stat -f \'%u:%g\' "$action_root" 2>/dev/null)"',
    'action_root_mode="$(stat -c %a "$action_root" 2>/dev/null || stat -f %Lp "$action_root" 2>/dev/null)"',
    'case "$action_root_mode" in \'\'|*[!0-7]*) echo "workspace action process root is invalid" >&2; exit 2;; esac',
    'action_root_permissions="$((0$action_root_mode))"',
    '[ "$action_root_owner" = "0:0" ] && [ $((action_root_permissions & 0022)) -eq 0 ] || { echo "workspace action process root is unsafe" >&2; exit 2; }',
    'chmod 700 "$action_root"',
    '[ ! -e "$action_pgid_file" ] && [ ! -L "$action_pgid_file" ] || { echo "workspace action token already exists" >&2; exit 2; }',
    'umask 077; : > "$action_pgid_file"',
    'chown root:root "$action_pgid_file"',
    'chmod 600 "$action_pgid_file"',
    `setsid --wait sh -c ${shellQuote(sessionScript)} &`,
    "action_launcher=$!",
    "set +e",
    'wait "$action_launcher"',
    "action_status=$?",
    'exit "$action_status"'
  ].join("\n");
  return ["sh", "-c", rootScript];
}

export function workspaceShellCleanupCommand(
  actionToken: string,
  options: { removeToken?: boolean; waitForToken?: boolean } = {}
): string[] {
  assertActionToken(actionToken);
  const pgidFile = `${ACTION_PROCESS_ROOT}/${actionToken}.pgid`;
  const script = [
    "set -eu",
    `action_root=${shellQuote(ACTION_PROCESS_ROOT)}`,
    `action_pgid_file=${shellQuote(pgidFile)}`,
    ...(options.waitForToken
      ? [
          'root_poll=0; while [ ! -e "$action_root" ] && [ ! -L "$action_root" ] && [ "$root_poll" -lt 50 ]; do root_poll=$((root_poll+1)); sleep .02; done'
        ]
      : []),
    '[ -d "$action_root" ] && [ ! -L "$action_root" ] || { echo "workspace action process root is invalid" >&2; exit 2; }',
    'action_root_owner="$(stat -c \'%u:%g\' "$action_root" 2>/dev/null || stat -f \'%u:%g\' "$action_root" 2>/dev/null)"',
    'action_root_mode="$(stat -c %a "$action_root" 2>/dev/null || stat -f %Lp "$action_root" 2>/dev/null)"',
    '[ "$action_root_owner" = "0:0" ] && [ "$action_root_mode" = "700" ] || { echo "workspace action process root is unsafe" >&2; exit 2; }',
    ...(options.waitForToken
      ? [
          'token_poll=0; while [ ! -e "$action_pgid_file" ] && [ ! -L "$action_pgid_file" ] && [ "$token_poll" -lt 50 ]; do token_poll=$((token_poll+1)); sleep .02; done'
        ]
      : []),
    '[ -f "$action_pgid_file" ] && [ ! -L "$action_pgid_file" ] || { echo "workspace action PGID is missing or invalid" >&2; exit 2; }',
    'action_file_owner="$(stat -c \'%u:%g\' "$action_pgid_file" 2>/dev/null || stat -f \'%u:%g\' "$action_pgid_file" 2>/dev/null)"',
    'action_file_mode="$(stat -c %a "$action_pgid_file" 2>/dev/null || stat -f %Lp "$action_pgid_file" 2>/dev/null)"',
    '[ "$action_file_owner" = "0:0" ] && [ "$action_file_mode" = "600" ] || { echo "workspace action PGID is unsafe" >&2; exit 2; }',
    'action_pgid="$(cat "$action_pgid_file")"',
    'case "$action_pgid" in \'\'|*[!0-9]*|???????????*) echo "workspace action PGID is invalid" >&2; exit 2;; esac',
    '[ "$action_pgid" -gt 1 ] || { echo "workspace action PGID is invalid" >&2; exit 2; }',
    'group_alive() { for process_stat in /proc/[0-9]*/stat; do [ -r "$process_stat" ] || continue; process_fields="$(cat "$process_stat" 2>/dev/null)" || continue; process_fields="${process_fields#*) }"; set -- $process_fields; if [ "${1:-}" != Z ] && [ "${3:-}" = "$action_pgid" ]; then return 0; fi; done; return 1; }',
    'kill -TERM "-$action_pgid" 2>/dev/null || true',
    'poll=0; while group_alive && [ "$poll" -lt 20 ]; do poll=$((poll+1)); sleep .1; done',
    'if group_alive; then kill -KILL "-$action_pgid" 2>/dev/null || true; fi',
    'poll=0; while group_alive && [ "$poll" -lt 50 ]; do poll=$((poll+1)); sleep .1; done',
    'if group_alive; then echo "workspace action process group did not terminate" >&2; exit 2; fi',
    ...(options.removeToken === false ? [] : ['rm -f "$action_pgid_file"'])
  ].join("\n");
  return ["sh", "-c", script];
}
