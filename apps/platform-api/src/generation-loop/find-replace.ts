// Multi-strategy find/replace for surgical edits, so the model's SEARCH text does not have to
// be byte-perfect (it commonly drifts in whitespace/indentation). Inspired by the layered
// "replacer" approach in opencode's edit tool; independent implementation.
//
// Each strategy yields candidate EXACT substrings of `content`. The first candidate that occurs
// exactly once, and is not disproportionately larger than the requested snippet, is replaced —
// leaving every other byte of the file untouched (that is the whole point: zero drift).

export type FindReplaceResult =
  | { ok: true; content: string }
  | { ok: false; reason: "not_found" | "ambiguous" };

function dropTrailingEmpty(lines: string[]): string[] {
  const copy = [...lines];
  while (copy.length > 1 && copy[copy.length - 1] === "") copy.pop();
  return copy;
}

// 1. Exact: the snippet as given.
function* exactStrategy(_content: string, find: string): Generator<string> {
  yield find;
}

// 2. Line-trimmed: match a run of lines where each line is equal after trimming, so leading/
//    trailing whitespace differences on any line don't defeat the match.
function* lineTrimmedStrategy(content: string, find: string): Generator<string> {
  const contentLines = content.split("\n");
  const findLines = dropTrailingEmpty(find.split("\n"));
  const n = findLines.length;
  if (n === 0) return;
  for (let i = 0; i + n <= contentLines.length; i += 1) {
    let matched = true;
    for (let j = 0; j < n; j += 1) {
      if (contentLines[i + j].trim() !== findLines[j].trim()) {
        matched = false;
        break;
      }
    }
    if (matched) yield contentLines.slice(i, i + n).join("\n");
  }
}

// 3. Block anchor: for a multi-line snippet, anchor on the first and last (trimmed) lines and
//    take everything between — robust when the interior differs slightly.
function* blockAnchorStrategy(content: string, find: string): Generator<string> {
  const findLines = dropTrailingEmpty(find.split("\n"));
  if (findLines.length < 3) return;
  const first = findLines[0].trim();
  const last = findLines[findLines.length - 1].trim();
  if (!first || !last) return;
  const contentLines = content.split("\n");
  for (let i = 0; i < contentLines.length; i += 1) {
    if (contentLines[i].trim() !== first) continue;
    for (let k = i + 2; k < contentLines.length; k += 1) {
      if (contentLines[k].trim() === last) {
        yield contentLines.slice(i, k + 1).join("\n");
        break;
      }
    }
  }
}

// 4. Whitespace-normalized: collapse all runs of whitespace to a single space and match the
//    words in order, tolerant of reflowed spacing/indentation/newlines.
function* whitespaceNormalizedStrategy(content: string, find: string): Generator<string> {
  const normalized = find.replace(/\s+/g, " ").trim();
  if (!normalized) return;
  const escaped = normalized.split(" ").map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const match = new RegExp(escaped.join("\\s+")).exec(content);
  if (match) yield match[0];
}

// 5. Indentation-flexible: match a block whose lines are identical after stripping the common
//    leading indentation, so a snippet copied at the wrong nesting depth still matches.
//    (Ported from opencode's IndentationFlexibleReplacer.)
function* indentationFlexibleStrategy(content: string, find: string): Generator<string> {
  const removeIndentation = (text: string): string => {
    const lines = text.split("\n");
    const nonEmpty = lines.filter((line) => line.trim().length > 0);
    if (nonEmpty.length === 0) return text;
    const minIndent = Math.min(
      ...nonEmpty.map((line) => line.match(/^(\s*)/)?.[1].length ?? 0)
    );
    return lines.map((line) => (line.trim().length === 0 ? line : line.slice(minIndent))).join("\n");
  };
  const normalizedFind = removeIndentation(find);
  const contentLines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= contentLines.length - findLines.length; i += 1) {
    const block = contentLines.slice(i, i + findLines.length).join("\n");
    if (removeIndentation(block) === normalizedFind) yield block;
  }
}

// 6. Escape-normalized: match when the snippet uses different escaping than the file (e.g. the
//    model wrote "\n" where the file has a real newline). (Ported from opencode's
//    EscapeNormalizedReplacer.)
function* escapeNormalizedStrategy(content: string, find: string): Generator<string> {
  const unescape = (str: string): string =>
    str.replace(/\\(n|t|r|'|"|`|\\|\n|\$)/g, (match, ch) => {
      switch (ch) {
        case "n":
        case "\n":
          return "\n";
        case "t":
          return "\t";
        case "r":
          return "\r";
        case "'":
          return "'";
        case '"':
          return '"';
        case "`":
          return "`";
        case "\\":
          return "\\";
        case "$":
          return "$";
        default:
          return match;
      }
    });
  const unescapedFind = unescape(find);
  if (unescapedFind !== find && content.includes(unescapedFind)) yield unescapedFind;
  const lines = content.split("\n");
  const findLines = unescapedFind.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i += 1) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    if (block !== unescapedFind && unescape(block) === unescapedFind) yield block;
  }
}

// 7. Trimmed-boundary: the model padded the snippet with leading/trailing blank lines; match the
//    trimmed core. (Ported from opencode's TrimmedBoundaryReplacer.)
function* trimmedBoundaryStrategy(content: string, find: string): Generator<string> {
  const trimmedFind = find.trim();
  if (trimmedFind === find) return;
  if (content.includes(trimmedFind)) yield trimmedFind;
  const lines = content.split("\n");
  const findLines = find.split("\n");
  for (let i = 0; i <= lines.length - findLines.length; i += 1) {
    const block = lines.slice(i, i + findLines.length).join("\n");
    if (block.trim() === trimmedFind) yield block;
  }
}

// 8. Context-aware: anchor on first/last lines and accept the block when at least half of the
//    interior lines match (trimmed) — tolerant of small interior drift on a same-length block.
//    (Ported from opencode's ContextAwareReplacer.)
function* contextAwareStrategy(content: string, find: string): Generator<string> {
  const findLines = dropTrailingEmpty(find.split("\n"));
  if (findLines.length < 3) return;
  const first = findLines[0].trim();
  const last = findLines[findLines.length - 1].trim();
  const contentLines = content.split("\n");
  for (let i = 0; i < contentLines.length; i += 1) {
    if (contentLines[i].trim() !== first) continue;
    for (let j = i + 2; j < contentLines.length; j += 1) {
      if (contentLines[j].trim() !== last) continue;
      const blockLines = contentLines.slice(i, j + 1);
      if (blockLines.length !== findLines.length) break;
      let matching = 0;
      let total = 0;
      for (let k = 1; k < blockLines.length - 1; k += 1) {
        const b = blockLines[k].trim();
        const f = findLines[k].trim();
        if (b.length > 0 || f.length > 0) {
          total += 1;
          if (b === f) matching += 1;
        }
      }
      if (total === 0 || matching / total >= 0.5) {
        yield blockLines.join("\n");
        return;
      }
      break;
    }
  }
}

// Ordered least- to most-fuzzy: an earlier (stricter) unique match always wins over a looser one.
// Ported layered "replacer" cascade from opencode's edit tool; independent implementation.
const STRATEGIES = [
  exactStrategy,
  lineTrimmedStrategy,
  blockAnchorStrategy,
  whitespaceNormalizedStrategy,
  indentationFlexibleStrategy,
  escapeNormalizedStrategy,
  trimmedBoundaryStrategy,
  contextAwareStrategy
];

// Guard: refuse a fuzzy candidate that is much larger than the requested snippet, so a loose
// anchor match never silently replaces a huge span.
function isDisproportionate(candidate: string, find: string): boolean {
  return candidate.length > find.length * 3 + 100;
}

export function applyFindReplace(
  content: string,
  find: string,
  replace: string
): FindReplaceResult {
  if (find === "") return { ok: false, reason: "not_found" };
  let sawMatch = false;
  for (const strategy of STRATEGIES) {
    for (const candidate of strategy(content, find)) {
      const first = content.indexOf(candidate);
      if (first === -1) continue;
      if (isDisproportionate(candidate, find)) continue;
      sawMatch = true;
      // Must be unique — otherwise try the next candidate/strategy, then report ambiguous.
      if (content.indexOf(candidate, first + candidate.length) !== -1) continue;
      return {
        ok: true,
        content: content.slice(0, first) + replace + content.slice(first + candidate.length)
      };
    }
  }
  return { ok: false, reason: sawMatch ? "ambiguous" : "not_found" };
}
