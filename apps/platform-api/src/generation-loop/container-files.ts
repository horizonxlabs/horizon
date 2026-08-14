import type { DockerEngine } from "../workspace-orchestrator/docker-engine";

const MARKER = "===EVCPFILE:";
const MAX_FILE_CHARS = 12000;
const MAX_WORKSPACE_FILE_CHARS = 120000;

export interface ContainerFileReader {
  read(containerId: string): Promise<Array<{ path: string; content: string }>>;
}

export interface WorkspaceFileBrowserReader {
  read(containerId: string): Promise<Array<{ path: string; content: string }>>;
}

function parseMarkedFiles(
  stdout: string,
  maxFileChars: number
): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  // split keeps the captured path as every odd element: [before, path, body, path, body, ...]
  const parts = stdout.split(new RegExp(`${MARKER}(.+?)===\\n`));
  for (let i = 1; i < parts.length; i += 2) {
    const path = (parts[i] ?? "").trim();
    let content = (parts[i + 1] ?? "").replace(/\n$/, "");
    if (content.length > maxFileChars) {
      content = `${content.slice(0, maxFileChars)}\n/* …truncated… */`;
    }
    if (path) files.push({ path, content });
  }
  return files;
}

// Reads the project's live source files from the running container so the AI edits the
// CURRENT app (preserving existing features) instead of rewriting from the static template.
// One exec call emits every file delimited by a marker, which we then split back apart.
export function createContainerFileReader(docker: DockerEngine): ContainerFileReader {
  return {
    async read(containerId: string): Promise<Array<{ path: string; content: string }>> {
      const script = [
        "cd /workspace 2>/dev/null || exit 0",
        // app and lib first: their handful of files (page, layout, mock-data, utils) must make
        // the cap before the ten-file ui kit exhausts it — the model needs the page + data layer
        // contents most; the kit's existence comes from the file tree + prompt contract.
        "for f in $(find app lib components -type f \\( -name '*.tsx' -o -name '*.ts' -o -name '*.css' -o -name '*.jsx' -o -name '*.js' \\) 2>/dev/null | grep -v node_modules | grep -v '.next' | head -8); do",
        `  echo "${MARKER}$f===";`,
        '  cat "$f";',
        '  echo "";',
        "done"
        // Join with newlines, NOT spaces: `|| exit 0` and `for … do` are separate statements, so
        // a space join produces `|| exit 0 for … do` — a shell syntax error that returns no files,
        // silently feeding the AI the empty starter instead of the live app (the cause of every
        // "edit didn't match / rewrote the whole file" drift).
      ].join("\n");

      let stdout = "";
      try {
        const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
        // The Docker exec stream returns CRLF line endings. Normalize to LF so (a) the file-marker
        // regex matches and (b) the content we show the AI is byte-identical to the LF file on disk
        // — otherwise the AI's edit SEARCH (copied from CRLF context) never matches the LF file.
        stdout = (result.stdout ?? "").replace(/\r\n/g, "\n");
      } catch {
        return [];
      }

      return parseMarkedFiles(stdout, MAX_FILE_CHARS);
    }
  };
}

// Every workspace file PATH (no contents, no cap) for the system prompt's file tree — the
// model must know what already exists so it edits instead of recreating, and never
// reinstalls what the template already ships.
export async function listWorkspaceTree(
  docker: Pick<DockerEngine, "execInContainer">,
  containerId: string
): Promise<string[]> {
  const script = [
    "cd /workspace 2>/dev/null || exit 0",
    "find . \\( -path './node_modules' -o -path './.next' -o -path './.git' \\) -prune -o -type f -print 2>/dev/null | sed 's|^\\./||' | sort"
  ].join("\n");
  try {
    const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
    return (result.stdout ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

// Runtime probe (self-debug detection): fetch the app at its real base path from inside the
// container and lift the visible error text when it is not serving 200 — this is what
// catches "blank page" states that build validation cannot see.
export async function probeWorkspaceRuntime(
  docker: Pick<DockerEngine, "execInContainer">,
  containerId: string,
  previewKey: string
): Promise<{ status: number; errors: string[] }> {
  if (!/^[\w-]+$/.test(previewKey)) return { status: 0, errors: [] };
  const url = `http://127.0.0.1:3000/preview/${previewKey}`;
  const script = [
    `status=$(wget -T 12 -q -O /tmp/evcp-probe --server-response '${url}' 2>&1 | awk '/^  HTTP\\//{code=$2} END{print code+0}')`,
    'echo "STATUS:$status"',
    'if [ "$status" != "200" ]; then',
    "  grep -oE '(Error:|Module not found|Unhandled Runtime Error|Syntax Error)[^<]{0,220}' /tmp/evcp-probe 2>/dev/null | head -3 | sed 's/^/EXCERPT:/'",
    "fi"
  ].join("\n");
  try {
    const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
    const lines = (result.stdout ?? "").replace(/\r\n/g, "\n").split("\n");
    const status = Number(lines.find((line) => line.startsWith("STATUS:"))?.slice(7) ?? 0);
    const errors = lines
      .filter((line) => line.startsWith("EXCERPT:"))
      .map((line) => line.slice(8).trim())
      .filter(Boolean);
    if (status !== 200 && errors.length === 0) {
      errors.push(`App responded with HTTP ${status || "no response"} at ${url}`);
    }
    return { status, errors: status === 200 ? [] : errors };
  } catch {
    return { status: 0, errors: [] }; // probe infra failure is never a user-facing error
  }
}

// Reads the workspace file tree for the Creator Code tab. This deliberately differs from
// createContainerFileReader above, which is capped to a tiny prompt context for AI edits.
export function createWorkspaceFileBrowserReader(docker: DockerEngine): WorkspaceFileBrowserReader {
  return {
    async read(containerId: string): Promise<Array<{ path: string; content: string }>> {
      const script = [
        "cd /workspace 2>/dev/null || exit 0",
        "find . \\( -path './node_modules' -o -path './.next' -o -path './.git' -o -path './dist' -o -path './build' -o -path './coverage' \\) -prune -o -type f \\( -name '*.tsx' -o -name '*.ts' -o -name '*.jsx' -o -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.md' -o -name '*.html' -o -name '*.mjs' -o -name '*.cjs' \\) -print 2>/dev/null | sort | while IFS= read -r f; do",
        '  path="${f#./}";',
        `  echo "${MARKER}$path===";`,
        `  size=$(wc -c < "$f" 2>/dev/null || echo 0);`,
        `  if [ "$size" -gt ${MAX_WORKSPACE_FILE_CHARS} ]; then`,
        `    head -c ${MAX_WORKSPACE_FILE_CHARS} "$f";`,
        '    echo "";',
        '    echo "/* …truncated… */";',
        "  else",
        '    cat "$f";',
        "  fi",
        '  echo "";',
        "done"
      ].join("\n");

      let stdout = "";
      try {
        const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
        stdout = (result.stdout ?? "").replace(/\r\n/g, "\n");
      } catch {
        return [];
      }

      return parseMarkedFiles(stdout, MAX_WORKSPACE_FILE_CHARS + 100);
    }
  };
}
