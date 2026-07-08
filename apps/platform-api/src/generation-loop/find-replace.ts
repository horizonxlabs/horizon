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

const STRATEGIES = [
  exactStrategy,
  lineTrimmedStrategy,
  blockAnchorStrategy,
  whitespaceNormalizedStrategy
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
