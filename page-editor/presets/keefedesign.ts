// keefedesign.com: the portfolio's type system (measured on the live site, as Semplice's H1–H4
// and text styles) and the Coco project's colours. Pass these to mountEditor:
//   mountEditor({ page: "long", types: KEEFEDESIGN_TYPES, swatches: COCO_SWATCHES, names: COCO_NAMES })
// The type styles use the site's font variables (--f-wide, --f-display, --f-cond, --f-text).

import type { SwatchGroup, TypeStyle } from "../editor";

/** The portfolio's type system (measured on keefedesign.com), as Semplice's H1–H4 and text styles. */
export const KEEFEDESIGN_TYPES: Record<string, TypeStyle> = {
  h1: { label: "H1", hint: "Expanded 700 · 72", css: "font-family: var(--f-wide); font-weight: 700; font-style: normal; font-size: clamp(40px, 5vw, 72px); line-height: 1; letter-spacing: 0.028em;" },
  h2: { label: "H2", hint: "Expanded 700 · 56", css: "font-family: var(--f-wide); font-weight: 700; font-style: normal; font-size: clamp(34px, 3.9vw, 56px); line-height: 1; letter-spacing: 0.02em;" },
  h3: { label: "H3", hint: "Expanded 700 · 40", css: "font-family: var(--f-wide); font-weight: 700; font-style: normal; font-size: clamp(28px, 2.7vw, 40px); line-height: 1; letter-spacing: 0.02em;" },
  h4: { label: "H4", hint: "Expanded 700 · 32", css: "font-family: var(--f-wide); font-weight: 700; font-style: normal; font-size: clamp(22px, 2.1vw, 32px); line-height: 0.95; letter-spacing: 0.0125em;" },
  display: { label: "Display", hint: "Strelka 800", css: "font-family: var(--f-display); font-weight: 800; font-style: normal; letter-spacing: 0.02em; line-height: 0.95;" },
  lede: { label: "Lede", hint: "Bebas 400 · 24", css: "font-family: var(--f-cond); font-weight: 400; font-style: normal; font-size: clamp(19px, 1.6vw, 24px); line-height: 1.5; letter-spacing: 0.075em;" },
  body: { label: "Body", hint: "Expanded 400 · 20", css: "font-family: var(--f-wide); font-weight: 400; font-style: normal; font-size: clamp(17px, 1.35vw, 20px); line-height: 1.22; letter-spacing: 0.02em;" },
  label: { label: "Label", hint: "Bebas 600 · 16", css: "font-family: var(--f-cond); font-weight: 600; font-style: normal; font-size: 16px; line-height: 1.5; letter-spacing: 0.025em;" },
  small: { label: "Small", hint: "Unica 400 · 14", css: "font-family: var(--f-text); font-weight: 400; font-style: normal; font-size: 14px; line-height: 1.6; letter-spacing: 0;" },
};

/** Quick-pick colours. App: the Blue Skies tokens. Figma: the Coco palette and primitives the Figma variables are generated from (design/tokens.json). */
export const COCO_SWATCHES: SwatchGroup[] = [
  {
    group: "App · Blue Skies",
    colours: [
      ["accent", "#FF741B"], ["accent-soft", "#FFB07A"], ["bg1", "#FE9B57"], ["receipt-orange", "#EF833A"], ["accent-pale", "#FFF1E6"], ["accent-text", "#F73C3C"],
      ["bg2", "#3B43BD"], ["blue2", "#0D0640"], ["ink", "#1D1F20"], ["muted", "#595E60"], ["faint", "#A3ABAE"], ["ring", "#BFCBD0"],
      ["line", "#EDF0F1"], ["well", "#F5F8F9"], ["paper", "#FFFFFF"], ["confirm", "#51E302"], ["dusk", "#39251F"], ["receipt-card", "#F7F6F0"],
    ],
  },
  {
    group: "Figma · Coco and primitives",
    colours: [
      ["coco/fur", "#221D1B"], ["coco/fur-shade", "#3A322F"], ["coco/fur-rim", "#5E5550"], ["coco/inner-ear", "#7A5446"], ["coco/tongue", "#EC8A9B"], ["coco/white", "#F4F0E8"],
      ["coco/white-edge", "#CFC7BB"], ["orange/400", "#FF6A33"], ["orange/500", "#FF5A1F"], ["amber/100", "#FFE6B0"], ["sand/50", "#F3F1EC"], ["sand/200", "#D9D5CB"],
      ["sand/400", "#A6A196"], ["sand/600", "#6E6A61"], ["sand/800", "#363531"], ["sand/900", "#1D1E1B"],
    ],
  },
  {
    group: "This page",
    colours: [["sky", "#BFDCF5"], ["cream", "#F4F0E8"], ["black", "#020202"], ["white", "#FFFFFF"], ["link orange", "#D4500A"]],
  },
];

/** Names the AI-pattern check may see capitalised on the Coco case study. */
export const COCO_NAMES = ["Coco", "Mac", "App", "Store", "Figma", "Swift", "SwiftUI", "AppKit", "React", "Claude", "Google", "Apple", "Partiful", "Notion", "Core", "Animation", "Canvas", "Intel", "MacBook", "Blue", "Skies"];
