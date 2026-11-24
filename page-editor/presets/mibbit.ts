// Mibbit (the groovebox web app): its type system and palette, taken from the app's design tokens
// (web/src/styles/tokens.css, 2026-11-24) and its op1-design-language skill. Pass these to mountEditor:
//   mountEditor({ page: "studio", types: MIBBIT_TYPES, swatches: mibbitSwatches(), names: MIBBIT_NAMES })
// The type styles use the app's own font variables, so they match what the app loads.

import type { SwatchGroup, TypeStyle } from "../editor";

/** Mibbit's type roles: pixel labels, mono values, sans body, LCD readouts. */
export const MIBBIT_TYPES: Record<string, TypeStyle> = {
  title: { label: "Title", hint: "Departure · 19–30", css: "font-family: var(--font-display); font-weight: 400; font-size: var(--tl-title-size, clamp(19px, 2.3vw, 30px)); line-height: 1.1; letter-spacing: 0.02em; text-transform: none;" },
  status: { label: "Status", hint: "Departure caps · 11", css: "font-family: var(--font-display); font-weight: 400; font-size: 11px; line-height: 1.3; letter-spacing: 0.18em; text-transform: uppercase;" },
  tab: { label: "Tab", hint: "Mono caps · 9", css: "font-family: var(--font-mono); font-weight: 500; font-size: 9px; line-height: 1.3; letter-spacing: 0.14em; text-transform: uppercase;" },
  value: { label: "Value", hint: "Geist Mono · 12", css: "font-family: var(--font-mono); font-weight: 500; font-size: 12px; line-height: 1.35; letter-spacing: 0; text-transform: none;" },
  body: { label: "Body", hint: "Geist Sans · 13", css: "font-family: var(--font-sans); font-weight: 400; font-size: 13px; line-height: 1.5; letter-spacing: 0; text-transform: none;" },
  heading: { label: "Heading", hint: "Geist Sans 600 · 18", css: "font-family: var(--font-sans); font-weight: 600; font-size: 18px; line-height: 1.25; letter-spacing: -0.005em; text-transform: none;" },
  small: { label: "Small", hint: "Geist Mono · 10", css: "font-family: var(--font-mono); font-weight: 400; font-size: 10px; line-height: 1.4; letter-spacing: 0.04em; text-transform: none;" },
  lcd: { label: "LCD", hint: "DSEG7", css: "font-family: var(--font-lcd); font-weight: 400; letter-spacing: 0.04em; text-transform: none;" },
};

/** Quick-pick colours, by token: the app's roles first, then the scales they come from. */
const SWATCH_TOKENS: { group: string; tokens: [string, string][] }[] = [
  {
    group: "Roles",
    tokens: [
      ["ink", "--color-ink"], ["ink-secondary", "--color-ink-secondary"], ["ink-muted", "--color-ink-muted"], ["outline", "--color-outline"], ["divider", "--color-divider"], ["graphite", "--color-graphite"], ["shell-edge", "--color-shell-edge"],
      ["brand", "--color-brand"], ["brand-hover", "--color-brand-hover"], ["brand-lit", "--color-brand-lit"], ["brand-ink", "--color-brand-ink"], ["focus", "--color-focus"],
    ],
  },
  {
    group: "OP-1 accents",
    tokens: [["blue", "--color-blue"], ["green", "--color-green"], ["white", "--color-white"], ["lcd-on", "--color-lcd-on"], ["gold-soft", "--color-gold-soft"], ["warning", "--color-warning"], ["success", "--color-success"], ["info", "--color-info"], ["error", "--color-error"]],
  },
  { group: "Brand scale", tokens: ["100", "300", "500", "600", "700", "800", "900", "950", "975"].map((s) => [`brand-${s}`, `--brand-${s}`]) },
  { group: "Casing scale", tokens: ["50", "200", "400", "600", "800", "900", "950", "975", "999"].map((s) => [`warm-${s}`, `--warm-${s}`]) },
];

/**
 * The quick-pick colours as the app has them right now (read from its tokens on the page), so a
 * palette written into tokens.css shows up here without editing this file. Call it in the browser.
 */
export function mibbitSwatches(): SwatchGroup[] {
  const cs = getComputedStyle(document.documentElement);
  const hex = (token: string) => {
    const v = cs.getPropertyValue(token).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null;
  };
  return SWATCH_TOKENS.map(({ group, tokens }) => ({
    group,
    colours: tokens.map(([name, token]) => [name, hex(token)] as [string, string | null]).filter((c): c is [string, string] => !!c[1]),
  })).filter((g) => g.colours.length);
}

/** Names the AI-pattern check may see capitalised. */
export const MIBBIT_NAMES = ["Mibbit", "Mibbits", "Mibbles", "Nibbit", "OP-1", "Explore", "Inbox", "Crews", "People", "Sampler", "BPM", "SPLIT"];
