import type { PrdSection, PrdVersion } from "../platform-services";

const SPEC_CHAR_CAP = 8000;

// Render a single PRD version's sections to Markdown for injection into the generation prompt.
// Returns null when there is no version, so the caller can simply omit the spec section.
export function renderSpecVersion(version: { sections: PrdSection[] } | null | undefined): string | null {
  if (!version) return null;
  const markdown = [...version.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => `## ${section.title}\n${section.body}`)
    .join("\n\n");
  if (markdown.length <= SPEC_CHAR_CAP) return markdown;
  return `${markdown.slice(0, SPEC_CHAR_CAP)}\n… (spec truncated)`;
}

// Render the confirmed PRD baseline (the frozen original v1.0) to Markdown. Kept for callers that
// specifically want the baseline; the generation loop grounds on the evolving current version.
export function renderBaselineSpec(versions: PrdVersion[]): string | null {
  return renderSpecVersion(versions.find((version) => version.isBaseline) ?? null);
}
