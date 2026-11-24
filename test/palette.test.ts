import { test } from "node:test";
import assert from "node:assert/strict";
import { contrast, hexToLch, lchToHex, scaleAtHue, scaleFromSeed, turnScale } from "../live-editor/colour/palette.ts";

// Mibbit's brand red scale (tokens.css, 2026-11-24): 50 → 999, #AA0017 at step 800 (index 8).
const BRAND = ["#FAF3F1", "#F8E3E0", "#F4CCC5", "#F0B0A8", "#ED8D81", "#E7665C", "#E53335", "#C02829", "#AA0017", "#6F1314", "#47090A", "#260204", "#060000"];
const L = (hex: string) => hexToLch(hex).L;

test("hex → OKLCH → hex round-trips", () => {
  for (const hex of [...BRAND, "#FFFFFF", "#000000", "#00D5F4", "#7A5F38"]) assert.equal(lchToHex(hexToLch(hex)), hex);
});

test("out-of-gamut colours land on the nearest sRGB colour, same lightness", () => {
  const hex = lchToHex({ L: 0.6, C: 0.5, H: 140 });
  assert.match(hex, /^#[0-9A-F]{6}$/);
  assert.ok(Math.abs(L(hex) - 0.6) < 0.01);
});

test("the reference seed gives the reference scale back", () => {
  const same = scaleFromSeed(BRAND, BRAND[8], 8);
  same.forEach((hex, i) => assert.ok(Math.abs(L(hex) - L(BRAND[i])) < 0.01, `step ${i}: ${hex} vs ${BRAND[i]}`));
});

test("a new seed sits exactly on the anchor, and lightness never rises step by step", () => {
  for (const seed of ["#6B1E2E", "#8A1538", "#3B5BDB", "#F2C94C", "#202020"]) {
    const scale = scaleFromSeed(BRAND, seed, 8);
    assert.equal(scale[8], seed.toUpperCase());
    // Strictly darker, except where a very dark seed leaves only near-black for the last steps.
    for (let i = 1; i < scale.length; i++) assert.ok(L(scale[i]) < L(scale[i - 1]) || L(scale[i]) < 0.06, `${seed}: step ${i} is lighter`);
  }
});

test("the light end stays light and the dark end stays dark when the seed moves", () => {
  const maroon = scaleFromSeed(BRAND, "#5A1020", 8);
  assert.ok(L(maroon[0]) > 0.95);
  assert.ok(L(maroon[12]) < 0.1);
});

test("turning a scale keeps its lightness and moves its hue", () => {
  const blue = scaleAtHue(BRAND, 8, 250);
  blue.forEach((hex, i) => assert.ok(Math.abs(L(hex) - L(BRAND[i])) < 0.02));
  assert.ok(Math.abs(hexToLch(blue[8]).H - 250) < 3);
  const grey = turnScale(BRAND, 0, 0);
  assert.ok(grey.every((hex) => hexToLch(hex).C < 0.01));
});

test("contrast matches WCAG", () => {
  assert.equal(Math.round(contrast("#FFFFFF", "#000000")), 21);
  assert.equal(contrast("#777777", "#777777"), 1);
  assert.ok(Math.abs(contrast("#F6F4F5", "#AA0017") - 7.05) < 0.01); // ink on brand, as scripts/palette-contrast.py
});
