import type { GoldenTemplate } from "../workspace-orchestrator/template";

function keywordsFrom(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

function scoreFile(file: { path: string; content: string }, keywords: string[]): number {
  const haystack = `${file.path} ${file.content}`.toLowerCase();
  return keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
}

export function selectContextFiles(
  template: GoldenTemplate,
  prompt: string,
  maxFiles = 5,
): Array<{ path: string; content: string }> {
  const keywords = keywordsFrom(prompt);
  const scored = template.files
    .map((file) => ({ file, score: scoreFile(file, keywords) }))
    .sort((a, b) => b.score - a.score);

  const hasMatches = scored.some((entry) => entry.score > 0);
  const ordered = hasMatches ? scored.map((entry) => entry.file) : template.files;
  return ordered.slice(0, maxFiles);
}
