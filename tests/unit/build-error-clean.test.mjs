import test from "node:test";
import assert from "node:assert/strict";

const { stripAnsi } = await import(
  "../../apps/platform-api/src/generation-loop/generation-action-utils.ts"
);
const { cleanBuildError, validateBuild } = await import(
  "../../apps/platform-api/src/generation-loop/generation-stream-helpers.ts"
);

const ESC = "\u001B";

test("stripAnsi removes escape sequences and normalizes carriage returns", () => {
  const raw = `${ESC}[33mwarn${ESC}[39m line one\r\nprogress 50%\rprogress 100%${ESC}[2K${ESC}[1G`;
  const clean = stripAnsi(raw);
  assert.ok(!clean.includes(ESC), "no ESC bytes survive");
  assert.ok(!clean.includes("[33m"), "no color codes survive");
  assert.ok(!clean.includes("\r"), "no carriage returns survive");
  assert.match(clean, /warn line one/);
});

test("cleanBuildError drops the telemetry banner and starts at the real error", () => {
  const raw = [
    `workspace validation failed (exit 1): ${ESC}[1mAttention${ESC}[0m: Next.js now collects completely anonymous telemetry regarding usage.`,
    "This information is used to shape Next.js' roadmap and prioritize features.",
    "You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:",
    "https://nextjs.org/telemetry",
    "Creating an optimized production build ...",
    "Linting and checking validity of types ...",
    "Failed to compile.",
    "",
    "./components/maintenance/TicketDialog.tsx:12:5",
    `Type error: Property 'trend' does not exist on type 'StatCardProps'.`
  ].join("\r\n");
  const clean = cleanBuildError(raw);
  assert.ok(clean.startsWith("Failed to compile."), `starts at the real error, got: ${clean.slice(0, 60)}`);
  assert.match(clean, /Type error: Property 'trend'/);
  assert.doesNotMatch(clean, /telemetry/i);
  assert.doesNotMatch(clean, /Attention/);
  assert.ok(!clean.includes(ESC));
});

test("cleanBuildError without a known marker still strips noise but keeps the message", () => {
  const clean = cleanBuildError(`workspace validation failed (exit 1): ${ESC}[31msomething odd broke${ESC}[0m`);
  assert.match(clean, /workspace validation failed/);
  assert.match(clean, /something odd broke/);
  assert.ok(!clean.includes(ESC));
});

test("validateBuild returns the CLEANED failure message for feedback and the bug box", async () => {
  const guard = {
    validate: async () => {
      throw new Error(
        `workspace validation failed (exit 1): ${ESC}[1mAttention${ESC}[0m: Next.js now collects completely anonymous telemetry regarding usage.\r\nFailed to compile.\r\nType error: x is not assignable`
      );
    }
  };
  const message = await validateBuild(guard, "p1");
  assert.ok(message.startsWith("Failed to compile."));
  assert.doesNotMatch(message, /telemetry/i);
});
