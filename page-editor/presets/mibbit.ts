// Mibbit (the groovebox web app): its type system and palette, taken from the app's design tokens
// (web/src/styles/tokens.css, 2026-11-24) and its op1-design-language skill. Pass these to mountEditor:
//   mountEditor({ page: "studio", types: MIBBIT_TYPES, swatches: MIBBIT_SWATCHES, names: MIBBIT_NAMES })
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

/** Quick-pick colours: the app's roles first, then the scales they come from. */
export const MIBBIT_SWATCHES: SwatchGroup[] = [
  {
    group: "Roles",
    colours: [
      ["ink", "#F6F4F5"], ["ink-secondary", "#C6BEBC"], ["ink-muted", "#AFA3A1"], ["outline", "#998A89"], ["divider", "#504643"], ["graphite", "#241E1E"], ["shell-edge", "#110D0C"],
      ["brand", "#AA0017"], ["brand-hover", "#C02829"], ["brand-lit", "#E7665C"], ["brand-ink", "#F0B0A8"], ["focus", "#ED8D81"],
    ],
  },
  {
    group: "OP-1 accents",
    colours: [["blue", "#00D5F4"], ["green", "#00F44E"], ["white", "#FFFFF6"], ["lcd-on", "#C7F08A"], ["gold-soft", "#E8C87A"], ["warning", "#B7842D"], ["success", "#5BC86B"], ["info", "#4A86F5"], ["error", "#E95F56"]],
  },
  {
    group: "Brand red scale",
    colours: [
      ["brand-100", "#F8E3E0"], ["brand-300", "#F0B0A8"], ["brand-500", "#E7665C"], ["brand-600", "#E53335"], ["brand-700", "#C02829"], ["brand-800", "#AA0017"],
      ["brand-900", "#6F1314"], ["brand-950", "#47090A"], ["brand-975", "#260204"],
    ],
  },
  {
    group: "Warm casing scale",
    colours: [
      ["warm-50", "#F6F4F5"], ["warm-200", "#D9D5D4"], ["warm-400", "#AFA3A1"], ["warm-600", "#807371"], ["warm-800", "#504643"], ["warm-900", "#393230"],
      ["warm-950", "#241E1E"], ["warm-975", "#110D0C"], ["warm-999", "#020202"],
    ],
  },
];

/** Names the AI-pattern check may see capitalised. */
export const MIBBIT_NAMES = ["Mibbit", "Mibbits", "Mibbles", "Nibbit", "OP-1", "Explore", "Inbox", "Crews", "People", "Sampler", "BPM", "SPLIT"];
