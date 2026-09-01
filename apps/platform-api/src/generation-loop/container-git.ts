import { randomUUID } from "node:crypto";

import type { DockerEngine } from "../workspace-orchestrator/docker-engine";

export interface ContainerGitCommitter {
  prepare(containerId: string): Promise<string>;
  renewSnapshot(containerId: string, snapshotToken: string): Promise<void>;
  hasChanges(containerId: string, snapshotToken: string): Promise<boolean>;
  validate(containerId: string): Promise<void>;
  restore(containerId: string, commitSha: string): Promise<void>;
  restoreSnapshot(containerId: string, snapshotToken: string): Promise<void>;
  releaseSnapshot(containerId: string, snapshotToken: string): Promise<void>;
  commit(containerId: string, message: string): Promise<string>;
}

function shellEscapeDouble(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1");
}

// Wraps a raw POSIX sh script so it can be passed as a single-quoted `sh -c`
// argument from within another single-quoted (or unquoted) shell context.
function shSingleQuoted(script: string): string {
  return `'${script.replace(/'/g, "'\\''")}'`;
}

function assertCommitSha(commitSha: string): void {
  if (!/^[0-9a-f]{4,64}$/i.test(commitSha)) throw new Error("invalid workspace commit SHA");
}

function assertSnapshotToken(token: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    throw new Error("invalid workspace snapshot token");
  }
}

export function createContainerGitCommitter(docker: DockerEngine): ContainerGitCommitter {
  const snapshotRoot = "/var/lib/evcp/turn-snapshots";
  const trustedGitHome = `${snapshotRoot}/git-home`;
  const trustedGitEnvironment = [
    "env -i",
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    `HOME=${trustedGitHome}`,
    "GIT_CONFIG_NOSYSTEM=1",
    "GIT_CONFIG_SYSTEM=/dev/null",
    "GIT_CONFIG_GLOBAL=/dev/null",
    "GIT_ATTR_NOSYSTEM=1"
  ].join(" ");
  const gitCommand = (extraEnvironment = "") =>
    `${trustedGitEnvironment}${extraEnvironment ? ` ${extraEnvironment}` : ""} git -c safe.directory=/workspace -c core.hooksPath=/dev/null`;
  const g = gitCommand();
  // Active turns renew this lease. A terminated API process therefore leaves an orphan that can
  // be reclaimed promptly instead of blocking the project for the former two-hour timeout.
  const staleLockSeconds = 45;
  const runtimePaths = "node_modules .next '.next-*'";
  const supportedSourceFind =
    "find /workspace -xdev \\( -path /workspace/.git -o -path /workspace/node_modules -o -path /workspace/.next -o -path '/workspace/.next-*' \\) -prune -o -print0";
  const snapshotGit = (directory: string) =>
    gitCommand(
      `GIT_INDEX_FILE="${directory}/index" GIT_OBJECT_DIRECTORY="${directory}/objects" GIT_ALTERNATE_OBJECT_DIRECTORIES=/workspace/.git/objects`
    );
  const capturePermissionManifest = (manifestPath: string) => {
    const perSourceScript = [
      'if [ "$source_path" = /workspace ]; then relative_path=.; else relative_path="${source_path#/workspace/}"; fi;',
      `if printf '%s' "$relative_path" | LC_ALL=C od -An -tu1 | awk '{ for (i = 1; i <= NF; i += 1) if ($i < 32 || $i == 127) found = 1 } END { exit found ? 0 : 1 }'; then echo "workspace paths containing control characters are not supported: $relative_path" >&2; exit 2; fi;`,
      'if [ -L "$source_path" ]; then entry_type=l; entry_mode=000;',
      'elif [ -f "$source_path" ]; then entry_type=f; entry_mode="$(stat -c %a "$source_path" 2>/dev/null || stat -f %Lp "$source_path")";',
      'elif [ -d "$source_path" ]; then entry_type=d; entry_mode="$(stat -c %a "$source_path" 2>/dev/null || stat -f %Lp "$source_path")";',
      'else echo "unsupported workspace source type: $relative_path" >&2; exit 2; fi;',
      `printf '%s\\t%s\\t%s\\n' "$entry_type" "$entry_mode" "$relative_path";`
    ].join(" ");
    // dash (Ubuntu's default /bin/sh) rejects the bash-only `read -r -d ''`
    // NUL delimiter outright, so a `while read -r -d ''` loop silently runs
    // zero iterations and exits 0 instead of iterating. xargs -0 hands each
    // NUL-delimited path to a POSIX `for name do ... done` loop as real argv
    // (defaults to iterating "$@"), which every POSIX shell supports.
    return `${supportedSourceFind} | LC_ALL=C sort -z | xargs -0 sh -c ${shSingleQuoted(`for source_path do ${perSourceScript} done`)} _ > "${manifestPath}"`;
  };
  const captureRestoreArchive = (archivePath: string) =>
    `tar -C /workspace --exclude=./.git --exclude=./node_modules --exclude=./.next --exclude=./.next-* -cf "${archivePath}" .`;
  const stageGitVisibleSource = [
    `${g} add -A`,
    `if ${g} rev-parse --verify HEAD >/dev/null 2>&1; then ${g} reset -q HEAD -- ${runtimePaths}; else ${g} rm -r --cached --ignore-unmatch -- ${runtimePaths} >/dev/null 2>&1 || true; fi`
  ].join(" && ");
  const applyPermissionManifest = (manifestPath: string) =>
    [
      `while IFS="$(printf '\\t')" read -r entry_type entry_mode relative_path; do`,
      'target_path="/workspace/$relative_path";',
      'case "$entry_type" in',
      'f) [ -f "$target_path" ] && [ ! -L "$target_path" ] || { echo "snapshot file type mismatch: $relative_path" >&2; exit 2; }; chmod "$entry_mode" "$target_path";;',
      'd) [ -d "$target_path" ] && [ ! -L "$target_path" ] || { echo "snapshot directory type mismatch: $relative_path" >&2; exit 2; }; chmod "$entry_mode" "$target_path";;',
      'l) [ -L "$target_path" ] || { echo "snapshot symlink type mismatch: $relative_path" >&2; exit 2; };;',
      '*) echo "invalid snapshot manifest entry type" >&2; exit 2;;',
      `esac; done < "${manifestPath}"`
    ].join(" ");
  const runRoot = async (containerId: string, script: string, operation: string) => {
    const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
    if (result.exitCode !== 0) {
      const detail = (result.stderr || result.stdout).trim().slice(-4000);
      throw new Error(`${operation} failed (exit ${result.exitCode}): ${detail}`);
    }
    return result.stdout.trim();
  };
  const rejectHardlinkedSupportedSourcePerEntry = [
    'if [ -f "$source_path" ] && [ ! -L "$source_path" ]; then',
    'link_count="$(stat -c %h "$source_path" 2>/dev/null || stat -f %l "$source_path")";',
    `case "$link_count" in ''|*[!0-9]*) echo "cannot read workspace source link count: $source_path" >&2; exit 2;; esac;`,
    'if [ "$link_count" -gt 1 ]; then echo "supported source hard links are not supported: $source_path" >&2; exit 2; fi;',
    "fi;"
  ].join(" ");
  // Same dash/bash `read -r -d ''` incompatibility as capturePermissionManifest above.
  const rejectHardlinkedSupportedSource = `${supportedSourceFind} | xargs -0 sh -c ${shSingleQuoted(`for source_path do ${rejectHardlinkedSupportedSourcePerEntry} done`)} _`;
  const secureWorkspaceSource = [
    "chown root:root /workspace",
    "chmod 1777 /workspace",
    'if [ -L /workspace/.git ]; then echo "refusing symlinked /workspace/.git" >&2; exit 2; fi',
    'if [ -e /workspace/.git ] && [ ! -d /workspace/.git ]; then echo "refusing non-directory /workspace/.git" >&2; exit 2; fi',
    rejectHardlinkedSupportedSource,
    "find /workspace -xdev -mindepth 1 \\( -path /workspace/.git -o -path /workspace/node_modules -o -path /workspace/.next -o -path '/workspace/.next-*' \\) -prune -o ! -user evcp -exec chown -h evcp:evcp {} +",
    'for runtime_entry in /workspace/node_modules /workspace/.next /workspace/.next-*; do if [ -e "$runtime_entry" ] || [ -L "$runtime_entry" ]; then chown -h evcp:evcp "$runtime_entry"; fi; done'
  ].join(" && ");
  const prepareTrustedGitRuntime = [
    `mkdir -p "${trustedGitHome}"`,
    `chown root:root "${trustedGitHome}"`,
    `chmod 700 "${trustedGitHome}"`
  ].join(" && ");
  const sanitizeRepository = [
    secureWorkspaceSource,
    prepareTrustedGitRuntime,
    "cd /workspace",
    `if [ ! -e .git ]; then ${g} init -q; fi`,
    'if [ -L .git ]; then echo "refusing symlinked /workspace/.git" >&2; exit 2; fi',
    'if [ ! -d .git ]; then echo "refusing non-directory /workspace/.git" >&2; exit 2; fi',
    "chown root:root .git",
    "chmod 700 .git",
    `git_metadata_symlink="$(find .git -type l -print -quit)"`,
    'if [ -n "$git_metadata_symlink" ]; then echo "refusing symlink inside /workspace/.git: $git_metadata_symlink" >&2; exit 2; fi',
    "rm -rf .git/hooks",
    "mkdir .git/hooks",
    "rm -f .git/objects/info/alternates .git/objects/info/http-alternates .git/commondir .git/config.worktree .git/info/attributes .git/info/grafts",
    "rm -rf .git/worktrees",
    'trusted_config=".git/config.evcp-new"',
    "umask 077",
    `printf '%s\n' '[core]' 'repositoryformatversion = 0' 'filemode = true' 'bare = false' 'logallrefupdates = true' '[user]' 'name = EVCP AI' 'email = ai@evcp.local' > "$trusted_config"`,
    'mv -f "$trusted_config" .git/config',
    "chown -R root:root .git",
    "find .git -type d -exec chmod 700 {} +",
    "find .git -type f -exec chmod 600 {} +"
  ].join(" && ");
  const secureSanitizedRepository = [
    "chown -R root:root /workspace/.git",
    "find /workspace/.git -type d -exec chmod 700 {} +",
    "find /workspace/.git -type f -exec chmod 600 {} +",
    secureWorkspaceSource
  ].join(" && ");
  const ownedLockTest = (token: string) =>
    `[ -f "$lock_dir/token" ] && [ ! -L "$lock_dir/token" ] && [ "$(cat "$lock_dir/token")" = "${token}" ]`;
  const acquireTransitionLock = (transitionOwner: string) => [
    'transition_lock="/var/lock/evcp-turn-reclaim.lock"',
    'transition_parent="${transition_lock%/*}"',
    '[ "$(id -u)" = 0 ] || { echo "workspace reclaim lock requires trusted root" >&2; exit 2; }',
    'if [ ! -d "$transition_parent" ]; then echo "invalid permanent workspace reclaim directory" >&2; exit 2; fi',
    'transition_parent_owner="$(stat -Lc \'%u:%g\' "$transition_parent" 2>/dev/null || stat -Lf \'%u:%g\' "$transition_parent" 2>/dev/null)"',
    'transition_parent_mode="$(stat -Lc %a "$transition_parent" 2>/dev/null || stat -Lf %Lp "$transition_parent" 2>/dev/null)"',
    'case "$transition_parent_mode" in \'\'|*[!0-7]*) echo "invalid permanent workspace reclaim directory" >&2; exit 2;; esac',
    'transition_parent_permissions="$((0$transition_parent_mode))"',
    'if [ "$transition_parent_owner" != "$(id -u):$(id -g)" ] || [ $((transition_parent_permissions & 0022)) -ne 0 ]; then echo "invalid permanent workspace reclaim directory" >&2; exit 2; fi',
    'if [ -L "$transition_lock" ] || { [ -e "$transition_lock" ] && [ ! -f "$transition_lock" ]; }; then echo "invalid permanent workspace reclaim lock" >&2; exit 2; fi',
    'if [ ! -e "$transition_lock" ]; then (umask 077; : >> "$transition_lock"); fi',
    'if [ -L "$transition_lock" ] || [ ! -f "$transition_lock" ]; then echo "invalid permanent workspace reclaim lock" >&2; exit 2; fi',
    'transition_lock_owner="$(stat -c \'%u:%g\' "$transition_lock" 2>/dev/null || stat -f \'%u:%g\' "$transition_lock" 2>/dev/null)"',
    'transition_lock_mode="$(stat -c %a "$transition_lock" 2>/dev/null || stat -f %Lp "$transition_lock" 2>/dev/null)"',
    'case "$transition_lock_mode" in \'\'|*[!0-7]*) echo "invalid permanent workspace reclaim lock" >&2; exit 2;; esac',
    'transition_lock_permissions="$((0$transition_lock_mode))"',
    'if [ "$transition_lock_owner" != "$(id -u):$(id -g)" ] || [ $((transition_lock_permissions & 0022)) -ne 0 ]; then echo "invalid permanent workspace reclaim lock" >&2; exit 2; fi',
    'chown root:root "$transition_lock"',
    'chmod 600 "$transition_lock"',
    'exec 9<>"$transition_lock"',
    "flock -x 9",
    'if [ -L "$transition_lock" ] || [ ! -f "$transition_lock" ]; then echo "invalid permanent workspace reclaim lock" >&2; exit 2; fi',
    'legacy_reclaim="$snapshot_root/reclaim.lock"',
    `legacy_quarantine="$snapshot_root/reclaim.legacy.${transitionOwner}"`,
    `if [ -e "$legacy_reclaim" ] || [ -L "$legacy_reclaim" ]; then if [ -L "$legacy_reclaim" ] || { [ ! -d "$legacy_reclaim" ] && [ ! -f "$legacy_reclaim" ]; }; then echo "invalid legacy workspace reclaim lock" >&2; exit 2; fi; legacy_mtime="$(stat -c %Y "$legacy_reclaim" 2>/dev/null || stat -f %m "$legacy_reclaim" 2>/dev/null)"; case "$legacy_mtime" in ''|*[!0-9]*) echo "invalid legacy workspace reclaim lock" >&2; exit 2;; esac; now="$(date +%s)"; legacy_age="$((now - legacy_mtime))"; if [ "$legacy_age" -le ${staleLockSeconds} ]; then echo "legacy snapshot reclaim is active" >&2; exit 2; fi; rm -rf "$legacy_quarantine"; mv "$legacy_reclaim" "$legacy_quarantine"; rm -rf "$legacy_quarantine"; fi`
  ];
  const releaseTransitionLock = ["flock -u 9", "exec 9>&-"];
  const removeOwnedLock = (token: string, transitionOwner: string, removeSnapshot: boolean) =>
    [
      ...acquireTransitionLock(transitionOwner),
      `if ${ownedLockTest(token)}; then${
        removeSnapshot ? ` rm -rf "$snapshot_root/snapshots/${token}";` : ""
      } rm -rf "$lock_dir"; fi`,
      ...releaseTransitionLock
    ].join("; ");
  const reconcileActiveLock = (transitionOwner: string) =>
    [
      `quarantine_dir="$snapshot_root/active.stale.${transitionOwner}";`,
      'if [ -e "$lock_dir" ] || [ -L "$lock_dir" ]; then',
      'if [ -L "$lock_dir" ] || [ ! -d "$lock_dir" ] || [ -L "$lock_dir/token" ] || [ -L "$lock_dir/timestamp" ]; then echo "workspace snapshot lock is active" >&2; exit 2; fi;',
      'if [ -e "$lock_dir/recovery-required" ] || [ -L "$lock_dir/recovery-required" ]; then echo "workspace snapshot recovery is required" >&2; exit 2; fi;',
      'if [ -e "$lock_dir/token" ] && [ ! -f "$lock_dir/token" ]; then echo "workspace snapshot lock is active" >&2; exit 2; fi;',
      'if [ -e "$lock_dir/timestamp" ] && [ ! -f "$lock_dir/timestamp" ]; then echo "workspace snapshot lock is active" >&2; exit 2; fi;',
      'stale_token=""; if [ -f "$lock_dir/token" ]; then stale_token="$(cat "$lock_dir/token")"; fi;',
      'case "$stale_token" in ????????-????-????-????-????????????) if [ -e "$snapshot_root/snapshots/$stale_token/recovery-required" ] || [ -L "$snapshot_root/snapshots/$stale_token/recovery-required" ]; then echo "workspace snapshot recovery is required" >&2; exit 2; fi;; esac;',
      'lock_timestamp=""; if [ -f "$lock_dir/timestamp" ]; then lock_timestamp="$(cat "$lock_dir/timestamp")"; fi;',
      'case "$lock_timestamp" in \'\' ) lock_timestamp="$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null)";; *[!0-9]*) echo "workspace snapshot lock is active" >&2; exit 2;; esac;',
      'now="$(date +%s)"; lock_age="$((now - lock_timestamp))";',
      `if [ "$lock_age" -le ${staleLockSeconds} ]; then echo "workspace snapshot lock is active" >&2; exit 2; fi;`,
      'rm -rf "$quarantine_dir"; mv "$lock_dir" "$quarantine_dir";',
      'case "$stale_token" in ????????-????-????-????-????????????) rm -rf "$snapshot_root/snapshots/$stale_token";; esac;',
      'rm -rf "$quarantine_dir";',
      "fi"
    ].join(" ");
  const acquireTurnLock = (token: string, transitionOwner: string) => [
    ...acquireTransitionLock(transitionOwner),
    reconcileActiveLock(transitionOwner),
    'mkdir "$lock_dir"',
    'chmod 700 "$lock_dir"',
    'token_tmp="$(mktemp "$lock_dir/.token.XXXXXX")"',
    'timestamp_tmp="$(mktemp "$lock_dir/.timestamp.XXXXXX")"',
    `printf '%s\\n' "${token}" > "$token_tmp"`,
    'date +%s > "$timestamp_tmp"',
    'chmod 600 "$token_tmp" "$timestamp_tmp"',
    'mv -f "$token_tmp" "$lock_dir/token"',
    'mv -f "$timestamp_tmp" "$lock_dir/timestamp"',
    ...releaseTransitionLock
  ];
  const verifyOwnedSnapshot = (token: string) => [
    `snapshot_root="${snapshotRoot}"`,
    'lock_dir="$snapshot_root/active.lock"',
    'snapshot_dir="$snapshot_root/snapshots/' + token + '"',
    `[ -f "$lock_dir/token" ] && [ "$(cat "$lock_dir/token")" = "${token}" ] || { echo "snapshot lock is not owned by token" >&2; exit 2; }`,
    '[ -f "$snapshot_dir/index" ] && [ -f "$snapshot_dir/tree" ] && [ -f "$snapshot_dir/manifest" ] && [ -f "$snapshot_dir/archive" ] && [ -d "$snapshot_dir/objects" ] || { echo "snapshot metadata is missing" >&2; exit 2; }'
  ];

  return {
    async prepare(containerId) {
      const token = randomUUID();
      const transitionOwner = randomUUID();
      const script = [
        "set -eu",
        `snapshot_root="${snapshotRoot}"`,
        'lock_dir="$snapshot_root/active.lock"',
        `snapshot_dir="$snapshot_root/snapshots/${token}"`,
        'mkdir -p "$snapshot_root/snapshots"',
        'chmod 700 "$snapshot_root" "$snapshot_root/snapshots"',
        ...acquireTurnLock(token, transitionOwner),
        'rm -rf "$snapshot_dir" && mkdir -p "$snapshot_dir/objects" && chmod 700 "$snapshot_dir" "$snapshot_dir/objects"',
        sanitizeRepository,
        `if ! ${g} rev-parse --verify HEAD >/dev/null 2>&1; then ${stageGitVisibleSource} && ${g} commit --no-verify --allow-empty -q -m "EVCP initial workspace"; fi`,
        `${g} diff --cached --quiet || { echo "pre-turn staged changes are not supported" >&2; exit 2; }`,
        `nested_git="$(find . \\( -path './.git' -o -name node_modules -o -name .next -o -name '.next-*' \\) -prune -o -name .git -print -quit)"`,
        '[ -z "$nested_git" ] || { echo "nested .git repositories are not supported: $nested_git" >&2; exit 2; }',
        secureSanitizedRepository,
        `${g} rev-parse HEAD > "$snapshot_dir/head"`,
        captureRestoreArchive("$snapshot_dir/archive"),
        'mkdir "$snapshot_dir/worktree"',
        'tar -C "$snapshot_dir/worktree" -xf "$snapshot_dir/archive"',
        `${snapshotGit("$snapshot_dir")} read-tree --empty`,
        `${snapshotGit("$snapshot_dir")} --work-tree="$snapshot_dir/worktree" add -f -A`,
        `${snapshotGit("$snapshot_dir")} write-tree > "$snapshot_dir/tree"`,
        'rm -rf "$snapshot_dir/worktree"',
        capturePermissionManifest("$snapshot_dir/manifest"),
        'chown -R root:root "$snapshot_dir"',
        'chmod -R go-rwx "$snapshot_dir" && chmod 700 "$snapshot_dir" "$snapshot_dir/objects" && chmod 600 "$snapshot_dir/head" "$snapshot_dir/index" "$snapshot_dir/tree" "$snapshot_dir/manifest" "$snapshot_dir/archive"'
      ].join(" && ");
      try {
        await runRoot(containerId, script, "workspace prepare");
        return token;
      } catch (error) {
        await runRoot(
          containerId,
          `set -eu; snapshot_root="${snapshotRoot}"; lock_dir="$snapshot_root/active.lock"; mkdir -p "$snapshot_root/snapshots"; ${removeOwnedLock(token, transitionOwner, true)}`,
          "workspace prepare cleanup"
        ).catch(() => undefined);
        throw error;
      }
    },
    async renewSnapshot(containerId, snapshotToken) {
      assertSnapshotToken(snapshotToken);
      const transitionOwner = randomUUID();
      const script = [
        "set -eu",
        `snapshot_root="${snapshotRoot}"`,
        'lock_dir="$snapshot_root/active.lock"',
        ...acquireTransitionLock(transitionOwner),
        ...verifyOwnedSnapshot(snapshotToken),
        'timestamp_tmp="$(mktemp "$lock_dir/.timestamp.XXXXXX")"',
        'date +%s > "$timestamp_tmp"',
        'chmod 600 "$timestamp_tmp"',
        'mv -f "$timestamp_tmp" "$lock_dir/timestamp"',
        ...releaseTransitionLock
      ].join(" && ");
      await runRoot(containerId, script, "workspace snapshot lease renewal");
    },
    async hasChanges(containerId, snapshotToken) {
      assertSnapshotToken(snapshotToken);
      const script = [
        "set -eu",
        ...verifyOwnedSnapshot(snapshotToken),
        sanitizeRepository,
        'comparison_dir="$(mktemp -d "$snapshot_root/compare.XXXXXX")"',
        'mkdir "$comparison_dir/objects" && chmod 700 "$comparison_dir" "$comparison_dir/objects"',
        `trap 'rm -rf "$comparison_dir"' EXIT HUP INT TERM`,
        "cd /workspace",
        captureRestoreArchive("$comparison_dir/archive"),
        'mkdir "$comparison_dir/worktree"',
        'tar -C "$comparison_dir/worktree" -xf "$comparison_dir/archive"',
        `${snapshotGit("$comparison_dir")} read-tree --empty`,
        `${snapshotGit("$comparison_dir")} --work-tree="$comparison_dir/worktree" add -f -A`,
        `comparison_tree="$(${snapshotGit("$comparison_dir")} write-tree)"`,
        'rm -rf "$comparison_dir/worktree"',
        capturePermissionManifest("$comparison_dir/manifest"),
        'if [ "$(cat "$snapshot_dir/tree")" = "$comparison_tree" ] && cmp -s "$snapshot_dir/manifest" "$comparison_dir/manifest"; then printf "false\\n"; else printf "true\\n"; fi'
      ].join(" && ");
      const comparison = await runRoot(containerId, script, "workspace snapshot comparison");
      if (comparison !== "true" && comparison !== "false") {
        throw new Error("workspace snapshot comparison returned an invalid result");
      }
      return comparison === "true";
    },
    async validate(containerId) {
      const script = [
        'validation_dir="$(mktemp -d /tmp/evcp-validation.XXXXXX)"',
        `trap 'rm -rf "$validation_dir"' EXIT HUP INT TERM`,
        'tar -C /workspace --exclude=.git --exclude=node_modules --exclude=.next --exclude=.next-* -cf - . | tar -C "$validation_dir" -xf -',
        'ln -s /workspace/node_modules "$validation_dir/node_modules"',
        'chown -R evcp:evcp "$validation_dir"',
        'cd "$validation_dir"',
        'su -s /bin/sh evcp -c "EVCP_VALIDATION_DIST_DIR=.next ./node_modules/.bin/next build"'
      ].join(" && ");
      await runRoot(containerId, script, "workspace validation");
    },
    async restore(containerId, commitSha) {
      assertCommitSha(commitSha);
      const token = randomUUID();
      const transitionOwner = randomUUID();
      await runRoot(
        containerId,
        [
          "set -eu",
          `snapshot_root="${snapshotRoot}"`,
          'lock_dir="$snapshot_root/active.lock"',
          'mkdir -p "$snapshot_root/snapshots"',
          'chmod 700 "$snapshot_root" "$snapshot_root/snapshots"',
          ...acquireTurnLock(token, transitionOwner),
          `cleanup_lock() { ${removeOwnedLock(token, transitionOwner, false)}; }`,
          "trap cleanup_lock EXIT HUP INT TERM",
          sanitizeRepository,
          `${g} cat-file -e "${commitSha}^{commit}"`,
          `${g} reset --hard ${commitSha} >/dev/null`,
          `${g} clean -fd >/dev/null`,
          secureSanitizedRepository,
          "cleanup_lock",
          "trap - EXIT HUP INT TERM"
        ].join(" && "),
        "workspace restore"
      );
    },
    async restoreSnapshot(containerId, snapshotToken) {
      assertSnapshotToken(snapshotToken);
      const script = [
        "set -eu",
        ...verifyOwnedSnapshot(snapshotToken),
        'mark_recovery_required() { set +e; umask 077; lock_recovery_tmp="$(mktemp "$lock_dir/.recovery-required.XXXXXX" 2>/dev/null)"; if [ -n "$lock_recovery_tmp" ]; then printf "recovery-required\\n" > "$lock_recovery_tmp" && chmod 600 "$lock_recovery_tmp" && chown root:root "$lock_recovery_tmp" && mv -f "$lock_recovery_tmp" "$lock_dir/recovery-required"; fi; snapshot_recovery_tmp="$(mktemp "$snapshot_dir/.recovery-required.XXXXXX" 2>/dev/null)"; if [ -n "$snapshot_recovery_tmp" ]; then printf "recovery-required\\n" > "$snapshot_recovery_tmp" && chmod 600 "$snapshot_recovery_tmp" && chown root:root "$snapshot_recovery_tmp" && mv -f "$snapshot_recovery_tmp" "$snapshot_dir/recovery-required"; fi; }',
        'restore_exit() { restore_status=$?; trap - EXIT HUP INT TERM; if [ "$restore_status" -ne 0 ]; then mark_recovery_required; fi; exit "$restore_status"; }',
        "trap restore_exit EXIT",
        "trap 'exit 2' HUP INT TERM",
        sanitizeRepository,
        'original_head="$(cat "$snapshot_dir/head")"',
        `find /workspace -xdev -mindepth 1 \\( -path /workspace/.git -o -path /workspace/node_modules -o -path /workspace/.next -o -path '/workspace/.next-*' \\) -prune -o -exec rm -rf {} +`,
        'tar -C /workspace -xf "$snapshot_dir/archive"',
        "cd /workspace",
        `${g} reset --mixed "$original_head" >/dev/null`,
        secureSanitizedRepository,
        applyPermissionManifest("$snapshot_dir/manifest"),
        "trap - EXIT HUP INT TERM"
      ].join(" && ");
      await runRoot(containerId, script, "workspace snapshot restore");
    },
    async releaseSnapshot(containerId, snapshotToken) {
      assertSnapshotToken(snapshotToken);
      const transitionOwner = randomUUID();
      const script = [
        "set -eu",
        `snapshot_root="${snapshotRoot}"`,
        'lock_dir="$snapshot_root/active.lock"',
        `snapshot_dir="$snapshot_root/snapshots/${snapshotToken}"`,
        ...acquireTransitionLock(transitionOwner),
        ...verifyOwnedSnapshot(snapshotToken),
        'if [ -e "$lock_dir/recovery-required" ] || [ -L "$lock_dir/recovery-required" ] || [ -e "$snapshot_dir/recovery-required" ] || [ -L "$snapshot_dir/recovery-required" ]; then echo "workspace snapshot recovery is required; refusing release" >&2; exit 2; fi',
        'rm -rf "$snapshot_dir"',
        'rm -rf "$lock_dir"',
        ...releaseTransitionLock
      ].join(" && ");
      await runRoot(containerId, script, "workspace snapshot release");
    },
    async commit(containerId, message) {
      const safe = shellEscapeDouble(message);
      const script = [
        "set -eu",
        `snapshot_root="${snapshotRoot}"`,
        sanitizeRepository,
        stageGitVisibleSource,
        `${g} diff --cached --quiet && { echo "workspace has no Git-visible changes; ignored-only changes cannot be committed" >&2; exit 2; } || true`,
        `${g} commit --no-verify -q -m "${safe}"`,
        `${g} rev-parse HEAD`,
        secureSanitizedRepository
      ].join(" && ");
      return runRoot(containerId, script, "git commit");
    }
  };
}
