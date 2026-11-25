/**
 * Texture Lab recipes: what a surface finish is, the ready-made ones, and how one is turned into
 * CSS for the running app.
 *
 * A texture is a finish, not a colour or a layout. It decides five things:
 *   - the shared shadow and sheen roles (raised, pressed, flush bevel, screen edge, glass sheen,
 *     glimmer) that most of an app's depth comes from;
 *   - an overlay drawn over surfaces (grain, brushed streaks, a weave, a dither);
 *   - what happens to a glossy gradient's colour body: kept, flattened to one colour, or softened
 *     to a gentle top-to-bottom fall;
 *   - what happens to specular highlights (hot spots, glass sheens): kept, removed, or swapped for
 *     a broad satin sheen;
 *   - whether machined knurls and ridges stay.
 *
 * Values are written in a tiny recipe language so one slider can scale the whole finish:
 *   P(6)            6px × strength            (shadow offsets and blurs; may be negative)
 *   L(8)            the site's light colour at 8% × strength
 *   D(55)           the site's dark colour at 55% × strength
 *   grain(fine, 10) a tiling noise image at 10% × strength: fine, coarse, brushed, paper, speckle
 */

export type Body = "flat" | "soft" | "keep";
export type Sheen = "remove" | "satin" | "keep";
export type Knurl = "remove" | "keep";

export const ROLES = {
  raised: "--shadow-neu-raised",
  pressed: "--shadow-neu-pressed",
  flush: "--shadow-neu-flush",
  screen: "--screen-edge-shadow",
  sheenLight: "--glass-sheen-light",
  sheenSoft: "--glass-sheen-soft",
  glimmer: "--glimmer-color",
} as const;
export type Role = keyof typeof ROLES;

export interface Texture {
  id: string;
  name: string;
  why: string;
  tokens: Partial<Record<Role, string>>;
  /** Background layers drawn over surfaces ("" for none), in the recipe language. */
  overlay: string;
  /** background-size for each overlay layer, comma separated ("" = auto for each). */
  overlaySize: string;
  body: Body;
  sheen: Sheen;
  knurl: Knurl;
  custom?: boolean;
}

/** The colours the recipe language mixes (custom properties the site defines). */
export interface Inks {
  light: string;
  dark: string;
}

// ---- the recipe language

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

const GRAINS: Record<string, { freq: string; octaves: number; size: number }> = {
  fine: { freq: "0.85", octaves: 2, size: 160 },
  coarse: { freq: "0.32", octaves: 3, size: 220 },
  brushed: { freq: "0.004 0.75", octaves: 2, size: 320 },
  paper: { freq: "0.05", octaves: 4, size: 260 },
  speckle: { freq: "1.6", octaves: 1, size: 120 },
};

/** A tiling grey-noise image at the given opacity (0–1). */
export function grainImage(kind: string, alpha: number): string {
  const g = GRAINS[kind] ?? GRAINS.fine;
  const a = round(Math.max(0, Math.min(1, alpha)), 3);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${g.size}' height='${g.size}'>` +
    `<filter id='n' x='0' y='0'><feTurbulence type='fractalNoise' baseFrequency='${g.freq}' numOctaves='${g.octaves}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 ${a}'/></filter>` +
    `<rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Recipe language → CSS at strength s (1 = as designed). */
export function resolve(text: string, s: number, inks: Inks): string {
  const pct = (a: string) => `${round(Math.min(100, Math.max(0, Number(a) * s)), 1)}%`;
  return text
    .replace(/\bP\(\s*(-?[\d.]+)\s*\)/g, (_, n: string) => `${round(Number(n) * s)}px`)
    .replace(/\bL\(\s*([\d.]+)\s*\)/g, (_, a: string) => `color-mix(in oklab, var(${inks.light}) ${pct(a)}, transparent)`)
    .replace(/\bD\(\s*([\d.]+)\s*\)/g, (_, a: string) => `color-mix(in oklab, var(${inks.dark}) ${pct(a)}, transparent)`)
    .replace(/\bgrain\(\s*([a-z]+)\s*,\s*([\d.]+)\s*\)/g, (_, kind: string, a: string) => grainImage(kind, (Number(a) / 100) * s));
}

/** A value Claude wrote, made safe to drop into a declaration: no blocks, no outside images. */
export function cleanValue(v: unknown, max = 900): string {
  return String(v ?? "")
    .replace(/[{};<>]/g, "")
    .replace(/url\s*\(/gi, "")
    .replace(/expression\s*\(|javascript:|@import/gi, "")
    .trim()
    .slice(0, max);
}

// ---- the ready-made finishes

const crosshatch = "repeating-linear-gradient(45deg, L(4) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, D(18) 0 1px, transparent 1px 4px)";

export const PRESETS: Texture[] = [
  {
    id: "matte",
    name: "Flat matte",
    why: "No gloss, no glow: hairline edges and a 1px contact shadow. Depth comes from tone alone, like the OP-1's own screen art.",
    tokens: { raised: "0 P(1) 0 D(60)", pressed: "inset 0 0 0 1px D(55)", flush: "inset 0 0 0 1px L(5)", screen: "inset 0 0 0 1px D(60)", sheenLight: "transparent", sheenSoft: "transparent", glimmer: "transparent" },
    overlay: "",
    overlaySize: "",
    body: "flat",
    sheen: "remove",
    knurl: "remove",
  },
  {
    id: "powder",
    name: "Powder coat",
    why: "Fine even grain over flat colour, crisp small shadows: the finish on rack gear and modern synth cases.",
    tokens: { raised: "0 P(1) P(2) D(55), 0 P(3) P(6) D(30)", pressed: "inset 0 P(1) P(2) D(55)", flush: "inset 0 1px 0 L(4), inset 0 -1px 0 D(30)", screen: "inset 0 P(1) P(2) D(50)", sheenLight: "transparent", sheenSoft: "transparent", glimmer: "transparent" },
    overlay: "grain(fine, 9)",
    overlaySize: "",
    body: "flat",
    sheen: "remove",
    knurl: "remove",
  },
  {
    id: "rubber",
    name: "Soft-touch rubber",
    why: "Velvety and low-contrast: wide, faint shadows, no highlights, a whisper of grain. Like silicone pads on a drum machine.",
    tokens: { raised: "0 P(2) P(8) D(38)", pressed: "inset 0 P(1) P(5) D(45)", flush: "inset 0 1px 0 L(3)", screen: "inset 0 P(1) P(4) D(45)", sheenLight: "transparent", sheenSoft: "transparent", glimmer: "transparent" },
    overlay: "grain(fine, 5)",
    overlaySize: "",
    body: "soft",
    sheen: "remove",
    knurl: "remove",
  },
  {
    id: "bead-blasted",
    name: "Bead-blasted aluminium",
    why: "Frosted metal: dense fine grain with a touch of coarse, a broad satin sheen instead of hot spots, sharp machined edges.",
    tokens: { raised: "0 P(1) 0 D(60), 0 P(4) P(10) D(35)", pressed: "inset 0 P(1) P(3) D(55)", flush: "inset 0 1px 0 L(9), inset 0 -1px 0 D(35)", screen: "inset 0 1px 0 L(8), inset 0 P(1) P(3) D(50)", sheenLight: "L(10)", sheenSoft: "L(4)", glimmer: "L(4)" },
    overlay: "grain(fine, 12), grain(coarse, 4)",
    overlaySize: "",
    body: "soft",
    sheen: "satin",
    knurl: "keep",
  },
  {
    id: "brushed",
    name: "Brushed metal",
    why: "Long horizontal brush streaks under a satin sheen. Knurls stay: it's still metal, just not polished.",
    tokens: { raised: "0 P(1) 0 D(55), 0 P(4) P(10) D(35)", pressed: "inset 0 P(1) P(3) D(55)", flush: "inset 0 1px 0 L(10), inset 0 -1px 0 D(35)", screen: "inset 0 1px 0 L(8), inset 0 P(1) P(3) D(50)", sheenLight: "L(12)", sheenSoft: "L(5)", glimmer: "L(5)" },
    overlay: "grain(brushed, 14)",
    overlaySize: "",
    body: "soft",
    sheen: "satin",
    knurl: "keep",
  },
  {
    id: "satin",
    name: "Satin anodised",
    why: "Smooth colour with one broad, soft sheen from above. Still has depth, but no wet spots or glare.",
    tokens: { raised: "0 P(2) P(6) D(45), 0 P(1) 0 D(40)", pressed: "inset 0 P(2) P(5) D(50)", flush: "inset 0 1px 0 L(7), inset 0 -1px 0 D(30)", screen: "inset 0 1px 0 L(8), inset 0 P(2) P(5) D(45)", sheenLight: "L(9)", sheenSoft: "L(4)", glimmer: "L(4)" },
    overlay: "",
    overlaySize: "",
    body: "soft",
    sheen: "satin",
    knurl: "remove",
  },
  {
    id: "acrylic",
    name: "Frosted acrylic",
    why: "Diffuse plastic: a soft inner edge glow, faint grain, flat colour, floaty shadow. Like a translucent TE case.",
    tokens: { raised: "0 P(6) P(18) D(32)", pressed: "inset 0 P(2) P(8) D(40)", flush: "inset 0 0 0 1px L(9), inset 0 P(8) P(14) P(-10) L(5)", screen: "inset 0 0 0 1px L(8), inset 0 P(2) P(8) D(40)", sheenLight: "L(6)", sheenSoft: "L(3)", glimmer: "transparent" },
    overlay: "grain(fine, 5)",
    overlaySize: "",
    body: "flat",
    sheen: "remove",
    knurl: "remove",
  },
  {
    id: "paper",
    name: "Printed paper",
    why: "Ink on stock: soft paper fibre, no shadows at all, just 1px rules. The most graphic and least physical option.",
    tokens: { raised: "0 0 0 1px D(45)", pressed: "inset 0 0 0 1px D(55)", flush: "inset 0 -1px 0 D(35)", screen: "inset 0 0 0 1px D(55)", sheenLight: "transparent", sheenSoft: "transparent", glimmer: "transparent" },
    overlay: "grain(paper, 14), grain(speckle, 5)",
    overlaySize: "",
    body: "flat",
    sheen: "remove",
    knurl: "remove",
  },
  {
    id: "engraved",
    name: "Engraved (Braun)",
    why: "Dieter Rams calm: surfaces are flush, edges are cut in with a light-over-dark line. No grain, no gloss.",
    tokens: { raised: "0 1px 0 L(6), 0 -1px 0 D(55)", pressed: "inset 0 1px 0 D(60), 0 1px 0 L(5)", flush: "inset 0 1px 0 L(5), inset 0 -1px 0 D(45)", screen: "inset 0 1px 0 D(60), 0 1px 0 L(5)", sheenLight: "transparent", sheenSoft: "transparent", glimmer: "transparent" },
    overlay: "",
    overlaySize: "",
    body: "flat",
    sheen: "remove",
    knurl: "remove",
  },
  {
    id: "concrete",
    name: "Cast concrete",
    why: "Heavy and raw: coarse mottled grain, deep but soft shadows, matte everywhere.",
    tokens: { raised: "0 P(3) P(10) D(50)", pressed: "inset 0 P(2) P(6) D(55)", flush: "inset 0 1px 0 L(4), inset 0 -1px 0 D(40)", screen: "inset 0 P(2) P(6) D(55)", sheenLight: "transparent", sheenSoft: "transparent", glimmer: "transparent" },
    overlay: "grain(coarse, 12), grain(fine, 6)",
    overlaySize: "",
    body: "flat",
    sheen: "remove",
    knurl: "remove",
  },
  {
    id: "felt",
    name: "Felt & fabric",
    why: "A tight woven crosshatch under soft grain, gentle shadows. Warm and tactile without any shine.",
    tokens: { raised: "0 P(2) P(7) D(40)", pressed: "inset 0 P(1) P(5) D(45)", flush: "inset 0 1px 0 L(3)", screen: "inset 0 P(1) P(5) D(45)", sheenLight: "transparent", sheenSoft: "transparent", glimmer: "transparent" },
    overlay: `${crosshatch}, grain(fine, 5)`,
    overlaySize: "auto, auto, auto",
    body: "flat",
    sheen: "remove",
    knurl: "remove",
  },
  {
    id: "dither",
    name: "1-bit dither",
    why: "Pixel-screen graphics: a dot screen over flat colour and hard offset shadows with no blur.",
    tokens: { raised: "P(2) P(2) 0 D(65)", pressed: "inset P(2) P(2) 0 D(65)", flush: "inset 0 0 0 1px D(45)", screen: "inset P(2) P(2) 0 D(65)", sheenLight: "transparent", sheenSoft: "transparent", glimmer: "transparent" },
    overlay: "radial-gradient(D(28) 0.6px, transparent 0.9px)",
    overlaySize: "3px 3px",
    body: "flat",
    sheen: "remove",
    knurl: "remove",
  },
];

// ---- what's in the app now (read from its stylesheets)

export type Cat = "shared" | "gloss" | "knurl" | "bevel" | "casing" | "stripes";

export const CATS: { id: Cat; label: string; hint: string; on: boolean }[] = [
  { id: "shared", label: "Shared shadows & sheens", hint: "The raised, pressed and bevel shadow roles and the glass sheen every part reuses", on: true },
  { id: "gloss", label: "Glossy gradients & highlights", hint: "Light-to-dark domes, hot spots and glass sheens written into parts (pads, knob caps, slices)", on: true },
  { id: "bevel", label: "Hand-made bevels", hint: "Inset highlight and shade shadows written into parts instead of using the shared roles", on: true },
  { id: "casing", label: "Casing & panels", hint: "Raised surfaces that get the overlay (grain, streaks) but have no gradient of their own", on: true },
  { id: "knurl", label: "Knurls & machined rings", hint: "Repeating rings and ridges on knob caps and rims", on: true },
  { id: "stripes", label: "Scanlines & stripes", hint: "Repeating stripes. Many are functional (grids, screens), so this starts off", on: false },
];

export type LayerKind = "sheen" | "body" | "knurl" | "stripes" | "scrim";

export interface Layer {
  text: string;
  kind: LayerKind;
  /** For a body: the colour it flattens to. */
  base?: string;
}

export interface Found {
  key: string;
  selector: string;
  /** Cascade layer the rule sits in (null: unlayered). The override goes in the same one. */
  layer: string | null;
  /** @media / @supports / @container around the rule, outermost first. */
  wrap: string[];
  file: string;
  cats: Cat[];
  layers: Layer[];
  sizes: string[];
  positions: string[];
  repeats: string[];
  shadow: string;
  shadowAs: "" | "raised" | "pressed" | "flush" | "both";
  was: { background: string; boxShadow: string };
}

/** Split at top-level commas. */
export function splitTop(value: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let cur = "";
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Every gradient function in a layer's text (with its own parentheses). */
function gradientsIn(text: string): string[] {
  const out: string[] = [];
  const re = /(?:repeating-)?(?:linear|radial|conic)-gradient\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < text.length && depth) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") depth--;
      i++;
    }
    out.push(text.slice(m.index, i));
    re.lastIndex = i;
  }
  return out;
}

const DESCRIPTOR = /^(to\s|from\s|at\s|in\s|circle|ellipse|closest-|farthest-|-?[\d.]+(deg|turn|rad|grad)\b|-?[\d.]+(px|%)\s+-?[\d.]+)/i;
const CLEAR = /^(transparent|rgba?\([^)]*,\s*0(\.0+)?\s*\))$/i;
const LIGHT = /--highlight|--neu-light|--glass-sheen|--glimmer|\bwhite\b|--warm-(50|100|200)\b|--aluminum-hi|#fff/i;
const SHADE = /--shade|--neu-dark|\bblack\b|--warm-99\d|#000/i;

const stopColour = (stop: string) => stop.replace(/(\s+-?[\d.]+(%|px|deg|turn|rad|em)?)+\s*$/, "").trim();

/** What one background layer is doing. */
export function classify(layer: string): Layer | null {
  const g = gradientsIn(layer)[0];
  if (!g) return null;
  if (/^repeating-linear/.test(g)) return { text: g, kind: "stripes" };
  if (/^repeating-(radial|conic)/.test(g)) return { text: g, kind: "knurl" };
  const args = splitTop(g.slice(g.indexOf("(") + 1, -1));
  if (args.length && (DESCRIPTOR.test(args[0]) || / at /.test(args[0]))) args.shift();
  const colours = args.map(stopColour).filter(Boolean);
  const solid = colours.filter((c) => !CLEAR.test(c));
  if (colours.length && colours.every((c) => CLEAR.test(c) || LIGHT.test(c)) && colours.some((c) => LIGHT.test(c))) return { text: g, kind: "sheen" };
  if (colours.length && colours.every((c) => CLEAR.test(c) || SHADE.test(c))) return { text: g, kind: "scrim" };
  const pool = solid.length ? solid : colours;
  return { text: g, kind: "body", base: pool[Math.floor(pool.length / 2)] ?? pool[0] };
}

const GLOW = /--color-|--pad-|--brand|--ring|--accent|--led|glow|--slice|--track|--step|--focus|--complement|--cyan|--green|--red|--display/i;
const ROLE_VARS = Object.values(ROLES);

/** How a hand-written box-shadow maps onto the shared roles ("" = leave it). */
export function bevelKind(shadow: string): Found["shadowAs"] {
  if (!shadow || shadow === "none" || GLOW.test(shadow)) return "";
  const parts = splitTop(shadow);
  const own = parts.filter((p) => !ROLE_VARS.some((r) => p.trim() === `var(${r})`));
  if (!own.length) return "";
  const inset = own.filter((p) => /\binset\b/.test(p));
  const outer = own.filter((p) => !/\binset\b/.test(p));
  if (!inset.length && !LIGHT.test(shadow)) return ""; // a plain drop shadow (menus, sheets): elevation, not texture
  if (inset.length && outer.length) return "both";
  if (outer.length) return "raised";
  const blur = Math.max(0, ...inset.map((p) => Number([...p.matchAll(/(-?[\d.]+)px/g)][2]?.[1] ?? 0)));
  return blur >= 4 ? "pressed" : "flush";
}

/** The file a stylesheet came from (Vite dev tags carry it), relative to the project. */
function fileOf(sheet: CSSStyleSheet | null): string {
  const node = sheet?.ownerNode as Element | null;
  const id = node?.getAttribute?.("data-vite-dev-id") ?? sheet?.href ?? "";
  const m = id.match(/(web\/src\/.*|src\/.*)$/);
  const path = m ? m[1] : id.split("/").slice(-2).join("/");
  return path.startsWith("src/") ? `web/${path}` : path;
}

/** A nested rule's selector, resolved against its parent's. */
function nest(child: string, parent: string | null): string {
  if (!parent) return child;
  const p = splitTop(parent).length > 1 ? `:is(${parent})` : parent;
  return splitTop(child)
    .map((part) => (part.includes("&") ? part.replace(/&/g, p) : `${p} ${part}`))
    .join(", ");
}

/**
 * Walk the page's stylesheets for texture: glossy gradients, knurls, stripes, hand-made bevels,
 * raised casing, and how many rules lean on the shared roles. Skips the tools' own sheets and
 * anything whose selector names a protected part.
 */
export function scan(protectWords: string[], skipSheets: string[]): { found: Found[]; shared: number } {
  const found = new Map<string, Found>();
  let shared = 0;
  const visit = (rules: CSSRuleList, layer: string | null, wrap: string[], parent: string | null, file: string) => {
    for (const rule of rules) {
      if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) {
        // An anonymous layer can't be re-entered from another sheet: leave its rules alone.
        if (!rule.name) continue;
        visit(rule.cssRules, layer ? `${layer}.${rule.name}` : rule.name, wrap, parent, file);
      } else if (rule instanceof CSSMediaRule) visit(rule.cssRules, layer, [...wrap, `@media ${rule.conditionText}`], parent, file);
      else if (rule instanceof CSSSupportsRule) visit(rule.cssRules, layer, [...wrap, `@supports ${rule.conditionText}`], parent, file);
      else if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) visit(rule.cssRules, layer, [...wrap, `@container ${rule.conditionText}`], parent, file);
      else if (rule instanceof CSSStyleRule) {
        const selector = nest(rule.selectorText, parent);
        take(selector, rule.style, layer, wrap, file);
        // Nested rules after their parent, so a nested @supports block (a build's color-mix
        // fallback pattern) overrides the plain fallback in the texture sheet as it does in the app.
        if (rule.cssRules?.length) visit(rule.cssRules, layer, wrap, selector, file);
      } else if (parent && rule.constructor?.name === "CSSNestedDeclarations") take(parent, (rule as CSSStyleRule).style, layer, wrap, file);
    }
  };
  const take = (selector: string, st: CSSStyleDeclaration, layer: string | null, wrap: string[], file: string) => {
    if (protectWords.some((w) => selector.includes(w)) || /canvas/.test(selector) || /^(:root|html)$/.test(selector.trim())) return;
    const bgImage = st.getPropertyValue("background-image");
    const bgShort = st.getPropertyValue("background");
    const background = bgImage || (/gradient\(/.test(bgShort) ? bgShort : "");
    const shadow = st.getPropertyValue("box-shadow");
    const usesRoles = ROLE_VARS.some((r) => `${background} ${shadow}`.includes(r));
    if (usesRoles) shared++;
    const layers = background ? (splitTop(background).map(classify).filter(Boolean) as Layer[]) : [];
    const cats: Cat[] = [];
    if (layers.some((l) => l.kind === "sheen" || l.kind === "body")) cats.push("gloss");
    if (layers.some((l) => l.kind === "knurl")) cats.push("knurl");
    if (layers.some((l) => l.kind === "stripes")) cats.push("stripes");
    const shadowAs = bevelKind(shadow);
    if (shadowAs) cats.push("bevel");
    const raisedFlat = !background && !/gradient|url\(/.test(bgShort) && (/--shadow-neu-raised/.test(shadow) || /var\(--surface-raised/.test(bgShort || st.getPropertyValue("background-color")));
    if (raisedFlat && !/::?(before|after|placeholder|selection|marker)/.test(selector)) cats.push("casing");
    if (!cats.length) return;
    const key = `${layer ?? ""}|${wrap.join("|")}|${selector}`;
    const prev = found.get(key);
    const sizes = splitTop(st.getPropertyValue("background-size"));
    const positions = splitTop(st.getPropertyValue("background-position"));
    const repeats = splitTop(st.getPropertyValue("background-repeat"));
    const entry: Found = {
      key,
      selector,
      layer,
      wrap,
      file,
      cats: [...new Set([...(prev?.cats ?? []), ...cats])],
      layers: layers.length ? layers : (prev?.layers ?? []),
      sizes: sizes.length ? sizes : (prev?.sizes ?? []),
      positions: positions.length ? positions : (prev?.positions ?? []),
      repeats: repeats.length ? repeats : (prev?.repeats ?? []),
      shadow: shadowAs ? shadow : (prev?.shadow ?? ""),
      shadowAs: shadowAs || (prev?.shadowAs ?? ""),
      was: { background: background || bgShort || prev?.was.background || "", boxShadow: shadow || prev?.was.boxShadow || "" },
    };
    found.set(key, entry);
  };
  for (const sheet of document.styleSheets) {
    const owner = sheet.ownerNode as Element | null;
    if (owner && skipSheets.includes(owner.id)) continue;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // another origin's sheet: not the app's
    }
    visit(rules, null, [], null, fileOf(sheet));
  }
  return { found: [...found.values()], shared };
}

// ---- texture → CSS

export interface BuildInput {
  texture: Texture;
  found: Found[];
  cats: Record<Cat, boolean>;
  excluded: Set<string>;
  strength: number;
  inks: Inks;
}

const SATIN = (inks: Inks, s: number) => resolve("linear-gradient(180deg, L(8) 0%, L(2) 38%, transparent 62%)", s, inks);
const SOFT = (base: string, inks: Inks, s: number) =>
  `linear-gradient(180deg, color-mix(in oklab, ${base}, var(${inks.light}) ${round(4 * s, 1)}%) 0%, ${base} 45%, color-mix(in oklab, ${base}, var(${inks.dark}) ${round(10 * s, 1)}%) 100%)`;

/** The declarations one found rule gets under a texture (empty: nothing to change). */
export function declsFor(f: Found, x: BuildInput, overlayVar: boolean): string[] {
  const t = x.texture;
  const { cats, strength: s, inks } = x;
  const decls: string[] = [];
  const hasOverlay = !!t.overlay.trim();
  const overlayLayers = hasOverlay ? splitTop(resolve(t.overlay, s, inks)) : [];
  const overlaySizes = splitTop(t.overlaySize || "");
  const touchBg = (cats.gloss && f.cats.includes("gloss")) || (cats.knurl && f.cats.includes("knurl")) || (cats.stripes && f.cats.includes("stripes"));
  if (touchBg) {
    const images: string[] = [];
    const sizes: string[] = [];
    const positions: string[] = [];
    const repeats: string[] = [];
    let base = "";
    let satinDone = false;
    const pick = (list: string[], i: number, fallback: string) => (list.length ? list[i % list.length] : fallback);
    f.layers.forEach((l, i) => {
      const keep = (text: string) => {
        images.push(text);
        sizes.push(pick(f.sizes, i, "auto"));
        positions.push(pick(f.positions, i, "0% 0%"));
        repeats.push(pick(f.repeats, i, "repeat"));
      };
      if (l.kind === "sheen" && cats.gloss) {
        if (t.sheen === "keep") keep(l.text);
        else if (t.sheen === "satin" && !satinDone) {
          satinDone = true;
          images.push(SATIN(inks, s));
          sizes.push("100% 100%");
          positions.push("0% 0%");
          repeats.push("no-repeat");
        }
      } else if (l.kind === "body" && cats.gloss) {
        if (t.body === "keep") keep(l.text);
        else if (t.body === "soft" && l.base) {
          images.push(SOFT(l.base, inks, s));
          sizes.push("100% 100%");
          positions.push("0% 0%");
          repeats.push("no-repeat");
          base = l.base;
        } else if (l.base) base = l.base;
        if (t.sheen === "satin" && !satinDone) {
          satinDone = true;
          images.unshift(SATIN(inks, s));
          sizes.unshift("100% 100%");
          positions.unshift("0% 0%");
          repeats.unshift("no-repeat");
        }
      } else if (l.kind === "knurl" && cats.knurl) {
        if (t.knurl === "keep") keep(l.text);
      } else if (l.kind === "stripes" && cats.stripes) {
        /* retextured: the stripes go */
      } else keep(l.text);
    });
    // The overlay goes on surfaces with a colour body (not on bare sheens or rings).
    if (hasOverlay && f.layers.some((l) => l.kind === "body")) {
      if (overlayVar) {
        images.unshift("var(--texture-overlay)");
        sizes.unshift("var(--texture-overlay-size)");
        positions.unshift(overlayLayers.map(() => "0 0").join(", "));
        repeats.unshift(overlayLayers.map(() => "repeat").join(", "));
      } else {
        images.unshift(...overlayLayers);
        sizes.unshift(...overlayLayers.map((_, i) => overlaySizes[i] || "auto"));
        positions.unshift(...overlayLayers.map(() => "0 0"));
        repeats.unshift(...overlayLayers.map(() => "repeat"));
      }
    }
    decls.push(`background-image: ${images.length ? images.join(", ") : "none"}`);
    if (images.length) {
      decls.push(`background-size: ${sizes.join(", ")}`);
      decls.push(`background-position: ${positions.join(", ")}`);
      decls.push(`background-repeat: ${repeats.join(", ")}`);
    }
    if (base) decls.push(`background-color: ${base}`);
  } else if (cats.casing && f.cats.includes("casing") && hasOverlay) {
    decls.push(`background-image: ${overlayVar ? "var(--texture-overlay)" : overlayLayers.join(", ")}`);
    decls.push(`background-size: ${overlayVar ? "var(--texture-overlay-size)" : overlayLayers.map((_, i) => overlaySizes[i] || "auto").join(", ")}`);
    decls.push(`background-repeat: repeat`);
  }
  if (cats.bevel && f.shadowAs) {
    const map = { raised: "var(--shadow-neu-raised)", pressed: "var(--shadow-neu-pressed)", flush: "var(--shadow-neu-flush)", both: "var(--shadow-neu-flush), var(--shadow-neu-raised)" } as const;
    decls.push(`box-shadow: ${map[f.shadowAs]}`);
  }
  return decls;
}

/** The shared roles under a texture, resolved. */
export function tokensFor(x: BuildInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, name] of Object.entries(ROLES) as [Role, string][]) {
    const v = x.texture.tokens[role];
    if (v) out[name] = resolve(v, x.strength, x.inks);
  }
  return out;
}

/**
 * The whole texture as one stylesheet. Each override sits in the same cascade layer (and media
 * query) as the rule it replaces, so the app's more specific state rules (lit, active, hover) still
 * win over it exactly as they did over the original.
 */
export function buildCss(x: BuildInput): string {
  const out: string[] = [];
  const root: string[] = [];
  if (x.cats.shared) for (const [name, v] of Object.entries(tokensFor(x))) root.push(`  ${name}: ${v};`);
  if (x.texture.overlay.trim()) {
    const layers = splitTop(resolve(x.texture.overlay, x.strength, x.inks));
    const sizes = splitTop(x.texture.overlaySize || "");
    root.push(`  --texture-overlay: ${layers.join(", ")};`, `  --texture-overlay-size: ${layers.map((_, i) => sizes[i] || "auto").join(", ")};`);
  }
  if (root.length) out.push(`:root {\n${root.join("\n")}\n}`);
  for (const f of x.found) {
    if (x.excluded.has(f.key)) continue;
    const decls = declsFor(f, x, true);
    if (!decls.length) continue;
    let block = `${f.selector} {\n${decls.map((d) => `  ${d};`).join("\n")}\n}`;
    for (const w of [...f.wrap].reverse()) block = `${w} {\n${block}\n}`;
    if (f.layer) block = `@layer ${f.layer} {\n${block}\n}`;
    out.push(block);
  }
  return out.join("\n\n");
}
