import type { PrdVersion } from "../platform-services";

const SPEC_CHAR_CAP = 8000;

// Render the confirmed PRD baseline to Markdown for injection into the generation prompt. Returns
// null when the project has no confirmed baseline so the caller can simply omit the spec section.
export function renderBaselineSpec(versions: PrdVersion[]): string | null {
  const baseline = versions.find((version) => version.isBaseline);
  if (!baseline) return null;
  const markdown = [...baseline.sections]
    .sort((a, b) => a.order - b.order)
    .map((section) => `## ${section.title}\n${section.body}`)
    .join("\n\n");
  if (markdown.length <= SPEC_CHAR_CAP) return markdown;
  return `${markdown.slice(0, SPEC_CHAR_CAP)}\n… (spec truncated)`;
}
