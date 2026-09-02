import test from "node:test";
import assert from "node:assert/strict";

const base = "../../apps/landing-web/src";
const { heroContent } = await import(`${base}/features/hero/hero-content.ts`);

test("hero copy is present and in English", () => {
  assert.ok(heroContent.headline.length > 0);
  assert.ok(heroContent.subhead.length > 0);
  assert.doesNotMatch(
    `${heroContent.headline} ${heroContent.subhead}`,
    /[฀-๿]/,
    "landing copy must be English only"
  );
});

test("hero offers a primary anchor and an external repository action", () => {
  assert.equal(heroContent.actions.length, 2);
  assert.ok(heroContent.actions[0].href.startsWith("#"));
  assert.equal(heroContent.actions[1].external, true);
  assert.ok(heroContent.actions[1].href.startsWith("https://"));
});
