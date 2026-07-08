import test from "node:test";
import assert from "node:assert/strict";
import { createMessageParser } from "../../apps/platform-api/src/generation-loop/message-parser.ts";

test("parses a complete artifact/action stream delivered in one chunk", () => {
  const parser = createMessageParser();
  const input =
    "Here is the plan.\n" +
    '<artifact id="art-1" title="Add home page">' +
    '<action type="file" filePath="app/page.tsx">export default function Page() { return null; }</action>' +
    '<action type="shell">npm run build</action>' +
    "</artifact>\nDone.";

  const events = parser.push(input).concat(parser.flush());

  const types = events.map((event) => event.type);
  assert.deepEqual(types, [
    "text",
    "action_start",
    "action_chunk",
    "action_end",
    "action_start",
    "action_chunk",
    "action_end",
    "text"
  ]);
  assert.equal(events[0].content.trim(), "Here is the plan.");
  assert.equal(events[1].actionType, "file");
  assert.equal(events[1].filePath, "app/page.tsx");
  assert.equal(events[2].content, "export default function Page() { return null; }");
  assert.equal(events[4].actionType, "shell");
  assert.equal(events[5].content, "npm run build");
  assert.equal(events[7].content.trim(), "Done.");
});

test("parses a stream split mid-tag across multiple push() calls", () => {
  const parser = createMessageParser();
  const part1 = '<artifact id="art-2" title="x"><action type="fi';
  const part2 = 'le" filePath="a.ts">const x = 1;</act';
  const part3 = "ion></artifact>";

  const events = [
    ...parser.push(part1),
    ...parser.push(part2),
    ...parser.push(part3),
    ...parser.flush()
  ];

  assert.equal(events.find((event) => event.type === "action_start").filePath, "a.ts");
  assert.equal(events.find((event) => event.type === "action_chunk").content, "const x = 1;");
});

test("reassembles an <artifact> opening tag split across chunks", () => {
  const parser = createMessageParser();
  // The streaming boundary falls INSIDE the opening "<artifact" tag.
  const events = [
    ...parser.push("Here you go:\n<arti"),
    ...parser.push(
      'fact id="b"><action type="file" filePath="app/page.tsx">const x = 1;</action></artifact>'
    ),
    ...parser.flush()
  ];
  const start = events.find((event) => event.type === "action_start");
  assert.ok(start, "expected an action_start even though <artifact> was split across chunks");
  assert.equal(start.filePath, "app/page.tsx");
  assert.equal(events.find((event) => event.type === "action_chunk").content, "const x = 1;");
});

test("parses a stream delivered one character at a time", () => {
  const parser = createMessageParser();
  const input =
    'intro <artifact id="c"><action type="file" filePath="app/page.tsx">const y = 2;</action></artifact>';
  const events = [];
  for (const char of input) events.push(...parser.push(char));
  events.push(...parser.flush());
  const start = events.find((event) => event.type === "action_start");
  assert.ok(start, "expected an action_start for a character-by-character stream");
  assert.equal(start.filePath, "app/page.tsx");
  const chunks = events
    .filter((event) => event.type === "action_chunk")
    .map((event) => event.content)
    .join("");
  assert.equal(chunks, "const y = 2;");
});

test("rejects an unknown action type", () => {
  const parser = createMessageParser();
  assert.throws(
    () => parser.push('<artifact id="a"><action type="delete">x</action></artifact>'),
    /unknown action type/
  );
});
