import { test } from "node:test";
import assert from "node:assert/strict";
import { slopIn } from "../page-editor/slop.ts";

const names = ["Coco", "Mac", "App", "Store", "Blue", "Skies"];
const flags = (text: string, heading = true) => slopIn(text, heading, names);

test("flags the headings readers called out", () => {
  assert.ok(flags("Meet Coco").includes("template heading"));
  assert.ok(flags("Built for performance").includes("template heading"));
  assert.ok(flags("Exploring styles").includes("-ing + category word"));
  assert.ok(flags("Render refinement").includes("optimisation speak"));
  assert.ok(flags("Consolidating Dashboards").includes("Title Case"));
  assert.ok(flags("A dog, not a dashboard.").includes("contrast slogan"));
  assert.ok(flags("One panel. Whole day.").includes("clipped fragments"));
  assert.ok(flags("A seamless experience", false).some((f) => f.startsWith("empty word")));
  assert.ok(flags("Not just a lamp — a companion").includes("em dash"));
});

test("leaves specific, plain headings alone", () => {
  for (const ok of ["She used 4.4% of a core just sitting there", "Nine looks before Blue Skies won", "How she is drawn", "Coco is on her way to the Mac App Store.", "I drew her from my own corgi"]) {
    assert.deepEqual(flags(ok), [], ok);
  }
});

test("a name alone isn't Title Case", () => {
  assert.ok(!flags("Meet Coco").includes("Title Case"));
});
