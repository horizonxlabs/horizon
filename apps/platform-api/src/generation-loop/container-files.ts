import type { DockerEngine } from "../workspace-orchestrator/docker-engine";

const MARKER = "===EVCPFILE:";
const MAX_FILE_CHARS = 12000;

export interface ContainerFileReader {
  read(containerId: string): Promise<Array<{ path: string; content: string }>>;
}

// Reads the project's live source files from the running container so the AI edits the
// CURRENT app (preserving existing features) instead of rewriting from the static template.
// One exec call emits every file delimited by a marker, which we then split back apart.
export function createContainerFileReader(docker: DockerEngine): ContainerFileReader {
  return {
    async read(containerId: string): Promise<Array<{ path: string; content: string }>> {
      const script = [
        "cd /workspace 2>/dev/null || exit 0",
        "for f in $(find app components lib -type f \\( -name '*.tsx' -o -name '*.ts' -o -name '*.css' -o -name '*.jsx' -o -name '*.js' \\) 2>/dev/null | grep -v node_modules | grep -v '.next' | head -8); do",
        `  echo "${MARKER}$f===";`,
        '  cat "$f";',
        '  echo "";',
        "done"
      ].join(" ");

      let stdout = "";
      try {
        const result = await docker.execInContainer(containerId, ["sh", "-c", script]);
        stdout = result.stdout ?? "";
      } catch {
        return [];
      }

      const files: Array<{ path: string; content: string }> = [];
      // split keeps the captured path as every odd element: [before, path, body, path, body, ...]
      const parts = stdout.split(new RegExp(`${MARKER}(.+?)===\\n`));
      for (let i = 1; i < parts.length; i += 2) {
        const path = (parts[i] ?? "").trim();
        let content = (parts[i + 1] ?? "").replace(/\n$/, "");
        if (content.length > MAX_FILE_CHARS) {
          content = `${content.slice(0, MAX_FILE_CHARS)}\n/* …truncated… */`;
        }
        if (path) files.push({ path, content });
      }
      return files;
    }
  };
}
