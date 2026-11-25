import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutForbidden } from "../live-editor/site-rules.ts";

const RULES = { protect: ['[class*="mibbit-orb"]'], protectWords: ["mibbit-orb", "demo-cursor", "mascot"], foreignTokenLayers: ["theme"] };
const LOCKED = new Set(["--radius-md", "--color-white"]);

test("a variation can't set a token the framework owns at runtime", () => {
  const { css, dropped } = withoutForbidden("& { --radius-md: 9px; --radius-pad: 12px; --color-white: #fff; }", RULES, LOCKED);
  assert.ok(!css.includes("--radius-md:"));
  assert.ok(!css.includes("--color-white:"));
  assert.ok(css.includes("--radius-pad: 12px"));
  assert.deepEqual(dropped.sort(), ["--color-white", "--radius-md"]);
});

test("reading a locked token is fine", () => {
  const { css, dropped } = withoutForbidden("& .ps-chip { border-radius: var(--radius-md); }", RULES, LOCKED);
  assert.ok(css.includes("var(--radius-md)"));
  assert.equal(dropped.length, 0);
});

test("rules that reach the mascot, or any canvas, are left out whole", () => {
  const input = "& .ps-chip { color: red; }\n& .mibbit-orb-slot { filter: hue-rotate(40deg); }\n& canvas { opacity: .5; }\n& .demo-cursor__ripple { border-color: blue; }";
  const { css, dropped } = withoutForbidden(input, RULES, LOCKED);
  assert.ok(css.includes(".ps-chip"));
  assert.ok(!css.includes("mibbit-orb") && !css.includes("canvas") && !css.includes("demo-cursor"));
  assert.equal(dropped.length, 3);
});
