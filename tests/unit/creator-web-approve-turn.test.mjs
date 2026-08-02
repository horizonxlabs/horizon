import test from "node:test";
import assert from "node:assert/strict";

const { buildApproveTurn } = await import("../../apps/creator-web/src/features/workspace/vibe-stream.ts");

test("buildApproveTurn builds a build-mode turn carrying the plan text as approvedPlan", () => {
  const turn = buildApproveTurn("add a header", "1. Create Header.\n2. Use it.");
  assert.deepEqual(turn, { prompt: "add a header", mode: "build", approvedPlan: "1. Create Header.\n2. Use it." });
});
