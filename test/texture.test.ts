import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, bevelKind, classify, declsFor, resolve, splitTop, type Found } from "../live-editor/texture/recipes.ts";

const inks = { light: "--warm-50", dark: "--warm-999" };

test("a pad's dome is a colour body that flattens to its middle stop", () => {
  const l = classify("radial-gradient(circle at 35% 25%, var(--surface-raised-hi) 0%, var(--surface-raised) 65%, var(--surface-base) 100%)");
  assert.equal(l?.kind, "body");
  assert.equal(l?.base, "var(--surface-raised)");
});

test("a hot spot and a glass sheen are sheens; a shade fade is a scrim", () => {
  assert.equal(classify("radial-gradient(circle at 36% 26%, var(--highlight-60) 0%, var(--highlight-10) 20%, transparent 46%)")?.kind, "sheen");
  assert.equal(classify("linear-gradient(315deg, var(--glass-sheen-soft), transparent 38%)")?.kind, "sheen");
  assert.equal(classify("linear-gradient(180deg, transparent, var(--shade-50) 40%)")?.kind, "scrim");
});

test("knurls and stripes are told apart", () => {
  assert.equal(classify("repeating-radial-gradient(circle at 50% 50%, var(--highlight-3) 0 1.5px, var(--shade-4) 1.5px 3px)")?.kind, "knurl");
  assert.equal(classify("repeating-linear-gradient(180deg, var(--scanline-color) 0 1px, transparent 1px 3px)")?.kind, "stripes");
});

test("a sampler slice keeps its own colour when flattened", () => {
  const l = classify("linear-gradient(180deg, color-mix(in oklab, var(--slice-color) 45%, white), var(--slice-color))");
  assert.equal(l?.kind, "body");
  assert.equal(l?.base, "var(--slice-color)");
});

test("bevels map onto the shared roles; glows and drop shadows are left alone", () => {
  assert.equal(bevelKind("inset 0 2px 1px var(--highlight-45), inset 0 -4px 7px var(--shade-62), 0 4px 7px var(--shade-55)"), "both");
  assert.equal(bevelKind("inset 0 1px 0 var(--highlight-8)"), "flush");
  assert.equal(bevelKind("0 0 12px var(--color-brand-lit)"), "");
  assert.equal(bevelKind("0 8px 24px var(--shade-55)"), "");
  assert.equal(bevelKind("var(--shadow-neu-flush), var(--shadow-neu-raised)"), "");
});

test("the recipe language scales with strength", () => {
  assert.equal(resolve("0 P(4) P(-2)", 0.5, inks), "0 2px -1px");
  assert.match(resolve("L(10)", 0.5, inks), /var\(--warm-50\) 5%/);
  assert.match(resolve("grain(fine, 10)", 1, inks), /^url\("data:image\/svg\+xml,/);
  assert.equal(splitTop("a(b, c), d").length, 2);
});

test("powder coat flattens a pad, drops its hot spot and lays grain over it", () => {
  const f: Found = {
    key: "k", selector: ".pad", layer: "components", wrap: [], file: "web/src/styles/components/pad.css", cats: ["gloss", "bevel"],
    layers: [classify("radial-gradient(circle at 30% 20%, var(--highlight-38) 0%, transparent 40%)")!, classify("radial-gradient(circle at 35% 25%, var(--surface-raised-hi) 0%, var(--surface-raised) 65%, var(--surface-base) 100%)")!],
    sizes: [], positions: [], repeats: [], shadow: "inset 0 1px 0 var(--highlight-8)", shadowAs: "flush", was: { background: "", boxShadow: "" },
  };
  const powder = PRESETS.find((p) => p.id === "powder")!;
  const all = { gloss: true, knurl: true, bevel: true, casing: true, shared: true, stripes: false };
  const decls = declsFor(f, { texture: powder, found: [f], cats: all, excluded: new Set(), strength: 1, inks }, true);
  assert.ok(decls.includes("background-image: var(--texture-overlay)"));
  assert.ok(decls.includes("background-color: var(--surface-raised)"));
  assert.ok(decls.includes("box-shadow: var(--shadow-neu-flush)"));
});
