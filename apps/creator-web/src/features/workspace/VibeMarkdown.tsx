import { Fragment, type ReactNode } from "react";

// Minimal, dependency-free markdown → React for chat messages. Builds real elements (no HTML
// injection, so it is XSS-safe) and tolerates incomplete syntax while streaming — an unclosed
// fence or `**` just renders as plain text until it closes. Supports fenced code blocks, inline
// code, bold, italic, links, headings (#/##/###), and bullet/ordered lists.

const INLINE = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)|(\[[^\]]+?\]\([^)]+?\))/g;

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
      nodes.push(
        link ? (
          <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener">
            {link[1]}
          </a>
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

export function VibeMarkdown({ text }: { text: string }): ReactNode {
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
      !isListLine(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(paragraph(para, key++));
  }
  return <>{blocks}</>;
}
