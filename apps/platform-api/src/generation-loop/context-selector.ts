import type { GoldenTemplate } from "../workspace-orchestrator/template";

function keywordsFrom(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

const CORE_CONTEXT_PATHS = [
  "app/page.tsx",
  "app/layout.tsx",
  "app/globals.css",
  "lib/mock-data.ts"
] as const;

function normalizedPathMentions(prompt: string): string[] {
  return (
    prompt
      .match(/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+/g)
      ?.map((path) => path.replace(/^\.\//, "")) ?? []
  );
}

function scorePath(path: string, prompt: string, keywords: string[]): number {
  const lowerPath = path.toLowerCase();
  const explicitPaths = normalizedPathMentions(prompt).map((candidate) => candidate.toLowerCase());
  const explicitScore = explicitPaths.includes(lowerPath) ? 10_000 : 0;
  const keywordScore = keywords.reduce(
    (score, keyword) => (lowerPath.includes(keyword) ? score + 100 : score),
    0
  );
  const coreIndex = CORE_CONTEXT_PATHS.indexOf(path as (typeof CORE_CONTEXT_PATHS)[number]);
  const coreScore = coreIndex >= 0 ? 10 - coreIndex : 0;
  return explicitScore + keywordScore + coreScore;
}

function scoreFile(file: { path: string; content: string }, keywords: string[]): number {
  const haystack = `${file.path} ${file.content}`.toLowerCase();
  return keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
}

export function selectContextFiles(
  template: GoldenTemplate,
  prompt: string,
  maxFiles = 5
): Array<{ path: string; content: string }> {
  const keywords = keywordsFrom(prompt);
  const scored = template.files
    .map((file) => ({ file, score: scoreFile(file, keywords) }))
    .sort((a, b) => b.score - a.score);

  const hasMatches = scored.some((entry) => entry.score > 0);
  const ordered = hasMatches ? scored.map((entry) => entry.file) : template.files;
  return ordered.slice(0, maxFiles);
}

export function selectContextPaths(paths: string[], prompt: string, maxFiles = 6): string[] {
  const promptWithoutPaths = prompt.replace(/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+/g, " ");
  const keywords = keywordsFrom(promptWithoutPaths);
  return paths
    .map((path, index) => ({ path, index, score: scorePath(path, prompt, keywords) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(0, maxFiles))
    .map(({ path }) => path);
}

export function selectLiveContextFiles(
  files: Array<{ path: string; content: string }>,
  prompt: string,
  options: { maxFiles?: number; maxChars?: number } = {}
): Array<{ path: string; content: string }> {
  const maxFiles = options.maxFiles ?? 6;
  const maxChars = options.maxChars ?? 60_000;
  const selectedPaths = selectContextPaths(
    files.map((file) => file.path),
    prompt,
    maxFiles
  );
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const selected: Array<{ path: string; content: string }> = [];
  let remaining = Math.max(0, maxChars);

  for (const path of selectedPaths) {
    if (remaining <= 0) break;
    const file = filesByPath.get(path);
    if (!file) continue;
    if (file.content.length <= remaining) {
      selected.push(file);
      remaining -= file.content.length;
      continue;
    }
    const truncationMarker = "\n/* …truncated… */";
    const content =
      remaining > truncationMarker.length
        ? `${file.content.slice(0, remaining - truncationMarker.length)}${truncationMarker}`
        : file.content.slice(0, remaining);
    selected.push({
      path: file.path,
      content
    });
    remaining = 0;
  }
  return selected;
}
