// Model-driven "suggested next" chips: the build prompt asks the model to close each reply
// with up to three <suggest>…</suggest> lines. They are stripped from the displayed text and
// rendered as clickable chips; clicking sends the suggestion text as the next prompt.

export type VibeSuggestion = { id: string; label: string; prompt: string };

const SUGGEST_PATTERN = /<suggest>([\s\S]*?)<\/suggest>/g;
const MAX_SUGGESTIONS = 3;

export function extractSuggestions(text: string): { text: string; suggestions: VibeSuggestion[] } {
  const suggestions: VibeSuggestion[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(SUGGEST_PATTERN)) {
    const value = match[1].replace(/\s+/g, " ").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key) || suggestions.length >= MAX_SUGGESTIONS) continue;
    seen.add(key);
    suggestions.push({ id: `model-suggest-${suggestions.length}`, label: value, prompt: value });
  }
  const cleaned = text.replace(SUGGEST_PATTERN, "").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  return { text: cleaned, suggestions };
}

export function stripSuggestions(text: string): string {
  return extractSuggestions(text).text;
}
