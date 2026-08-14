import { posix } from "node:path";

const PROJECT_ROOTS = ["app", "components", "lib", "public"] as const;
const DIRECT_COMMANDS = new Set([
  "node",
  "npm",
  "npx",
  "pnpm",
  "git",
  "ls",
  "find",
  "rg",
  "grep",
  "sed",
  "head",
  "tail",
  "wc",
  "mkdir",
  "cp",
  "mv"
]);
const SHELL_META = /[;&|`$<>\n\r]/;

export type PiAgentToolLimits = {
  maxToolCalls: number;
  maxToolInputBytes: number;
  maxToolOutputBytes: number;
  shellTimeoutMs: number;
};

export function filterAgentWorkspaceFiles(
  files: Array<{ path: string; content: string }>
): Array<{ path: string; content: string }> {
  return files.filter((file) => {
    try {
      return normalizeProjectPath(file.path) === file.path;
    } catch {
      return false;
    }
  });
}

export function normalizeProjectPath(path: string, options?: { allowRoot?: boolean }): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("workspace path is required");
  if (hasControlCharacter(trimmed) || trimmed.includes("\\")) {
    throw new Error("workspace path contains unsafe characters");
  }
  if (trimmed.startsWith("/") || /^[A-Za-z]:/.test(trimmed)) {
    throw new Error("workspace path must be project-relative");
  }
  const segments = trimmed.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("workspace path contains an unsafe segment");
  }
  const normalized = posix.normalize(trimmed);
  const root = PROJECT_ROOTS.find(
    (candidate) => normalized === candidate || normalized.startsWith(`${candidate}/`)
  );
  if (!root || (!options?.allowRoot && normalized === root)) {
    throw new Error("workspace path is outside an allowed project root");
  }
  return normalized;
}

export function assertSafeCommand(command: string, args: string[]): void {
  if (
    !command ||
    hasControlCharacter(command) ||
    SHELL_META.test(command) ||
    !DIRECT_COMMANDS.has(command)
  ) {
    throw new Error("workspace command is not allowlisted");
  }
  for (const arg of args) {
    if (typeof arg !== "string" || hasControlCharacter(arg) || SHELL_META.test(arg)) {
      throw new Error("workspace command argument contains unsafe characters");
    }
    if (arg.startsWith("/") || /^[A-Za-z]:[\\/]/.test(arg) || arg.includes("docker.sock")) {
      throw new Error("workspace command argument references an unsafe host path");
    }
  }
  const joined = args.join(" ").toLowerCase();
  if (/\b(process\.env|printenv|env\b|set\b)/.test(joined)) {
    throw new Error("workspace command may not dump environment values");
  }
  if (command === "git" && /^(clone|fetch|pull|push|remote|ls-remote)\b/.test(joined)) {
    throw new Error("workspace command may not access a network remote");
  }
  if (
    (command === "npm" || command === "pnpm") &&
    /^(view|info|search|ping|login|publish)\b/.test(joined)
  ) {
    throw new Error("workspace command may not query or publish to a network service");
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}

export function assertInputLimit(value: unknown, maxBytes: number): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes) {
    throw new Error(`tool input exceeds the ${maxBytes}-byte limit`);
  }
}

export function clipUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  const suffix = "\n… (truncated)";
  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  const bodyBytes = Math.max(0, maxBytes - suffixBytes);
  const body = Buffer.from(text, "utf8").subarray(0, bodyBytes).toString("utf8").replace(/�+$/, "");
  return `${body}${suffix}`;
}

export function safeToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(
      /\b(?:DATABASE_URL|LITELLM_MASTER_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)\b(?:\s*=\s*[^\s]+)?/gi,
      "[redacted-secret]"
    )
    .replace(/\bprovider\.secret\b(?:\s*=\s*[^\s]+)?/gi, "[redacted-secret]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "sk-[redacted]")
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "postgresql://[redacted]")
    .replace(
      /(?:\/Users|\/home|\/var\/folders|\/private\/(?:tmp|var)|\/tmp)(?:\/[^\s'"]*)?/g,
      "[redacted-host-path]"
    )
    .replace(/\b(?:container|mem)-[A-Za-z0-9][A-Za-z0-9_.-]*\b/g, "[redacted-container]")
    .replace(/\b[0-9a-f]{12,64}\b/gi, "[redacted-container]");
}
