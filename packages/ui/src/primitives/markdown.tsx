import { Fragment, type ReactNode } from "react";

// Dependency-free markdown -> React. Builds real elements (no HTML injection, so it is XSS-safe) and
// tolerates incomplete syntax — an unclosed fence or `**` renders as plain text until it closes.
// Supports fenced code blocks, inline code, bold, italic, safe links, headings (#/##/###),
// bullet/ordered lists, blockquotes, horizontal rules, and GFM-style tables. Shared design-system
// primitive (styles live in packages/ui/styles.css).

const INLINE = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)|(\[[^\]]+?\]\([^)]+?\))/g;

function safeLinkHref(value: string): string | undefined {
  const href = value.trim();
  if (
    /^(https?:|mailto:)/i.test(href) ||
    (href.startsWith("/") && !href.startsWith("//")) ||
    href.startsWith("#")
  ) {
    return href;
  }
  return undefined;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="vibe-md-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /\[([^\]]+?)\]\(([^)]+?)\)/.exec(token);
      const href = link ? safeLinkHref(link[2]) : undefined;
      nodes.push(
        link && href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>
        ) : link ? (
          link[1]
        ) : (
          token
        )
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function paragraph(lines: string[], key: number): ReactNode {
  return (
    <p key={key} className="vibe-md-p">
      {lines.map((line, index) => (
        <Fragment key={index}>
          {renderInline(line, `p${key}-${index}`)}
          {index < lines.length - 1 ? <br /> : null}
        </Fragment>
      ))}
    </p>
  );
}

const isListLine = (line: string) => /^\s*([-*]|\d+\.)\s+/.test(line);
const isHeading = (line: string) => /^(#{1,3})\s+/.test(line);
const isFence = (line: string) => line.trimStart().startsWith("```");
const isBlockquote = (line: string) => /^\s*>\s?/.test(line);
const isHorizontalRule = (line: string) => /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line);
const isTableSeparator = (line: string) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells;
}

function isTableStart(lines: string[], index: number): boolean {
  return index + 1 < lines.length && lines[index].includes("|") && isTableSeparator(lines[index + 1]);
}

export function Markdown({ text }: { text: string }): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isFence(line)) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !isFence(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // skip the closing fence (or run past EOF while still streaming)
      blocks.push(
        <pre key={key++} className="vibe-md-pre">
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    if (isTableStart(lines, i)) {
      const headers = splitTableRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={key++} className="vibe-md-table-wrap">
          <table className="vibe-md-table">
            <thead>
              <tr>
                {headers.map((header, index) => (
                  <th key={index}>{renderInline(header, `th${key}-${index}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex}>
                      {renderInline(row[cellIndex] ?? "", `td${key}-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <div key={key++} className={`vibe-md-h vibe-md-h${level}`}>
          {renderInline(heading[2], `h${key}`)}
        </div>
      );
      i += 1;
      continue;
    }

    if (isBlockquote(line)) {
      const quote: string[] = [];
      while (i < lines.length && isBlockquote(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={key++} className="vibe-md-quote">
          {quote.map((quoteLine, index) => (
            <Fragment key={index}>
              {renderInline(quoteLine, `quote${key}-${index}`)}
              {index < quote.length - 1 ? <br /> : null}
            </Fragment>
          ))}
        </blockquote>
      );
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push(<hr key={key++} className="vibe-md-rule" />);
      i += 1;
      continue;
    }

    if (isListLine(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && isListLine(lines[i])) {
        const content = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        items.push(<li key={items.length}>{renderInline(content, `li${key}-${items.length}`)}</li>);
        i += 1;
      }
      blocks.push(
        ordered ? (
          <ol key={key++} className="vibe-md-list">
            {items}
          </ol>
        ) : (
          <ul key={key++} className="vibe-md-list">
            {items}
          </ul>
        )
      );
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isFence(lines[i]) &&
      !isHeading(lines[i]) &&
      !isListLine(lines[i]) &&
      !isBlockquote(lines[i]) &&
      !isHorizontalRule(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(paragraph(para, key++));
  }
  return <>{blocks}</>;
}
