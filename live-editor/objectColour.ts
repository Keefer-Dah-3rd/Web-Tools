/**
 * Recolouring an object (a pad, a button, a knob, an icon), not just its text.
 *
 * Apps rarely paint an object with one flat background. Mibbit's pads take their hue from a colour
 * variable (--row-color) that feeds a gradient, a bloom and a ::before fill; its buttons are radial
 * gradients with a coloured glow; its icons and knobs are SVG strokes. A flat `background: X` either
 * misses those or flattens them into a sticker.
 *
 * So the first time an object gets a colour, `planFor` reads how it is painted, and `objectCss`
 * writes the rules that carry the new colour through the same paint:
 *   - if it paints with chromatic colour variables, those are the app's own idea of the object's
 *     colour: they are set on the object, so every gradient, glow, icon and lit state built from
 *     them follows, shading intact, and a neutral body stays neutral. Otherwise:
 *   - its own gradients (and a painted ::before/::after) are tinted: each stop takes the new hue and
 *     chroma and keeps its own lightness offset and alpha, so a 3D pad stays 3D;
 *   - a solid background becomes the colour;
 *   - coloured glows in its box-shadow take the hue (dark drop shadows stay as they are);
 *   - SVG shapes take the colour on whatever they paint (fill or stroke), at their own alpha, when
 *     the icon is the object (an icon on a painted body is content and keeps its colour).
 * Canvas drawings can't be reached from CSS; `planFor` notes them so the toolbar can say so.
 */
import { type SiteRules, holdsProtected, isProtected } from "./site-rules";

type Pseudo = "::before" | "::after";

export interface ObjectPlan {
  /** Chromatic colour variables the object paints with. */
  vars: string[];
  /** Whether its own background (or a painted pseudo-element) is built from one of those variables. */
  bgByVar: boolean;
  /** Its own background: "solid" colour, a "gradient" to tint, or "none" painted. */
  bg: "solid" | "gradient" | "none";
  /** The solid background's alpha, when bg is "solid" (a glass panel stays see-through). */
  bgAlpha?: number;
  /** The gradient as it was (computed), when bg is "gradient". */
  bgImage?: string;
  /** The box-shadow as it was, when it has a coloured glow. */
  glow?: string;
  /** Painted pseudo-elements not built from a variable: their background as it was. */
  pseudos: { which: Pseudo; image?: string; color?: string }[];
  /** SVG shapes inside (or the shape itself): a selector and the alpha of what it paints. */
  shapes: { sel: string; fillA?: number; strokeA?: number }[];
  /** It is, or holds, a canvas: drawn in code, out of CSS's reach. */
  canvas: boolean;
  /** It holds a protected part (the mascot): don't set variables that would cascade into it. */
  guard?: boolean;
}

const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/g;
const PAINT_DECL = /(?:^|[;{\s])(background(?:-color|-image)?|box-shadow|border(?:-[\w]+)?-color|fill|stroke|outline-color)\s*:\s*([^;}]+)/g;
const SHAPES = "path, circle, rect, ellipse, polygon, polyline, line";

/** A colour as oklch numbers, worked out by the browser (relative colour syntax). */
let probe: HTMLElement | undefined;
export const oklchOf = (colour: string): { l: number; c: number; h: number; a: number } | null => {
  if (!probe) {
    probe = document.createElement("i");
    probe.style.display = "none";
    document.documentElement.append(probe);
  }
  probe.style.color = "";
  probe.style.color = `oklch(from ${colour} l c h / alpha)`;
  if (!probe.style.color) return null;
  const m = getComputedStyle(probe).color.match(/oklch\(\s*([\d.e+-]+%?)\s+([\d.e+-]+)\s+([\d.e+-]+|none)(?:\s*\/\s*([\d.e+-]+%?))?/);
  if (!m) return null;
  const pct = (v: string) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v));
  return { l: pct(m[1]), c: parseFloat(m[2]), h: m[3] === "none" ? 0 : parseFloat(m[3]), a: m[4] ? pct(m[4]) : 1 };
};

const isChromatic = (colour: string) => (oklchOf(colour)?.c ?? 0) > 0.035;
const paints = (colour: string) => (oklchOf(colour)?.a ?? 0) > 0.01;

/** Every style rule on the page (inside @media, @layer, @supports too). */
function* styleRules(sheets: Iterable<CSSStyleSheet>): Generator<CSSStyleRule> {
  const walk = function* (list: CSSRuleList): Generator<CSSStyleRule> {
    for (const rule of list) {
      if (rule instanceof CSSStyleRule) {
        yield rule;
        if (rule.cssRules?.length) yield* walk(rule.cssRules);
      } else if ("cssRules" in rule) yield* walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of sheets) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue; // another origin's sheet
    }
    yield* walk(list);
  }
}

/** The colour variables named in the paint declarations of the rules that style this element now. */
const paintVars = (el: Element, sheets: Iterable<CSSStyleSheet>) => {
  const all = new Set<string>();
  const inBackground = new Set<string>();
  const inline = el.getAttribute("style") ?? "";
  // A pseudo-element's background counts as the object's body only while it shows.
  const shows = (which: string) => {
    const ps = getComputedStyle(el, which);
    return ps.content !== "none" && ps.content !== "normal" && ps.display !== "none" && ps.visibility !== "hidden" && parseFloat(ps.opacity) > 0.05;
  };
  const scan = (text: string, pseudo: string | null) => {
    const body = !pseudo || shows(pseudo);
    for (const [, prop, value] of text.matchAll(PAINT_DECL)) {
      for (const [, name] of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        all.add(name);
        if (body && prop.startsWith("background")) inBackground.add(name);
      }
    }
  };
  scan(`;${inline}`, null);
  for (const rule of styleRules(sheets)) {
    for (const part of rule.selectorText.split(",")) {
      const pseudo = part.match(/::?(before|after)\b/)?.[1] ?? null;
      const own = part.replace(/::?(?:before|after)\b/g, "").trim() || "*";
      let hit = false;
      try {
        hit = el.matches(own);
      } catch {
        /* a selector this browser can't test */
      }
      if (hit) {
        scan(`;${rule.style.cssText}`, pseudo && `::${pseudo}`);
        break;
      }
    }
  }
  return { all, inBackground };
};

/** How this object is painted. Read it before any override of ours is on it. */
export function planFor(el: Element, selectorOf: (el: Element) => string, rules: SiteRules | undefined, skip: (CSSStyleSheet | null)[] = []): ObjectPlan {
  const sheets = [...document.styleSheets].filter((sh) => !skip.includes(sh));
  const cs = getComputedStyle(el);
  const { all, inBackground } = paintVars(el, sheets);
  const vars = [...all].filter((name) => {
    const value = cs.getPropertyValue(name).trim();
    return !!value && CSS.supports("color", value) && isChromatic(value);
  });
  const bgByVar = vars.some((v) => inBackground.has(v));

  const image = cs.backgroundImage;
  const bg = image && image !== "none" && /gradient/.test(image) ? "gradient" : paints(cs.backgroundColor) ? "solid" : "none";

  const shadow = cs.boxShadow;
  const glow = shadow && shadow !== "none" && (shadow.match(COLOUR_FN) ?? []).some(isChromatic) ? shadow : undefined;

  const pseudos: ObjectPlan["pseudos"] = [];
  if (!bgByVar) {
    for (const which of ["::before", "::after"] as Pseudo[]) {
      const ps = getComputedStyle(el, which);
      if (ps.content === "none" || ps.content === "normal" || ps.display === "none" || parseFloat(ps.opacity) <= 0.05) continue;
      const pi = ps.backgroundImage;
      if (pi && pi !== "none" && /gradient/.test(pi)) pseudos.push({ which, image: pi });
      else if (paints(ps.backgroundColor)) pseudos.push({ which, color: ps.backgroundColor });
    }
  }

  const shapes: ObjectPlan["shapes"] = [];
  const shapeEls = [...(el.matches(SHAPES) ? [el] : []), ...el.querySelectorAll(SHAPES)].filter((s) => !isProtected(rules, s)).slice(0, 80);
  for (const s of shapeEls) {
    const ss = getComputedStyle(s);
    const alpha = (v: string) => (v && v !== "none" && !v.startsWith("url(") ? oklchOf(v)?.a ?? 0 : 0);
    const fillA = alpha(ss.fill);
    const strokeA = ss.strokeWidth === "0px" ? 0 : alpha(ss.stroke);
    if (fillA > 0.01 || strokeA > 0.01) shapes.push({ sel: selectorOf(s), fillA: fillA > 0.01 ? fillA : undefined, strokeA: strokeA > 0.01 ? strokeA : undefined });
  }

  const canvas = el.tagName === "CANVAS" || !!el.querySelector("canvas");
  const bgAlpha = bg === "solid" ? (oklchOf(cs.backgroundColor)?.a ?? 1) : undefined;
  return { vars, bgByVar, bg, bgAlpha, bgImage: bg === "gradient" ? image : undefined, glow, pseudos, shapes, canvas, guard: holdsProtected(rules, el) || undefined };
}

/** Whether the plan found anything CSS can recolour (beyond a plain box fill). */
export const reachable = (plan: ObjectPlan) => plan.vars.length > 0 || plan.bg !== "none" || !!plan.glow || plan.pseudos.length > 0 || plan.shapes.length > 0;

/**
 * Every colour in a CSS value retinted to `hex`: each takes its hue and chroma, keeps its own
 * alpha, and shifts its lightness by the same amount, so the darkest-to-lightest spread (the shading)
 * survives and the average lands on the new colour. `onlyChromatic` leaves neutral colours (drop
 * shadows, white sheens) alone.
 */
export const tint = (value: string, hex: string, onlyChromatic = false): string => {
  const to = oklchOf(hex);
  if (!to) return value;
  const stops = (value.match(COLOUR_FN) ?? []).map((c) => ({ c, k: oklchOf(c) })).filter((s) => s.k && s.k.a > 0.01 && (!onlyChromatic || s.k.c > 0.035));
  if (!stops.length) return value;
  const mean = stops.reduce((sum, s) => sum + s.k!.l, 0) / stops.length;
  const shift = (to.l - mean).toFixed(4);
  const swap = new Set(stops.map((s) => s.c));
  return value.replace(COLOUR_FN, (c) =>
    swap.has(c) ? `oklch(from ${c} clamp(0, calc(l + ${shift}), 1) ${to.c.toFixed(4)} ${to.h.toFixed(2)} / alpha)` : c,
  );
};

/** The colour at a paint's own alpha (opaque stays a plain hex). */
const withAlpha = (hex: string, alpha: number | undefined) => (alpha == null || alpha >= 0.99 ? hex : `rgb(from ${hex} r g b / ${+alpha.toFixed(3)})`);

/** The rules that put `hex` on the object, through the paint the plan found. */
export function objectCss(selector: string, plan: ObjectPlan | undefined, hex: string): string {
  if (!plan) return `${selector} { background: ${hex} !important; }`;
  const own: string[] = [];
  const out: string[] = [];
  if (plan.vars.length && !plan.guard) {
    // The app already says what this object's colour is: change that, and everything built from it
    // (body, glow, icon, lit states) follows the way the app draws it.
    for (const v of plan.vars) own.push(`${v}: ${hex} !important;`);
  } else {
    if (plan.bg === "gradient" && plan.bgImage) own.push(`background-image: ${tint(plan.bgImage, hex)} !important;`);
    else if (plan.bg === "solid" || (!reachable(plan) && !plan.canvas)) own.push(`background: ${withAlpha(hex, plan.bgAlpha)} !important;`);
    for (const p of plan.pseudos) {
      out.push(`${selector}${p.which} { ${p.image ? `background-image: ${tint(p.image, hex)}` : `background: ${withAlpha(hex, oklchOf(p.color ?? "")?.a)}`} !important; }`);
    }
    if (plan.glow) own.push(`box-shadow: ${tint(plan.glow, hex, true)} !important;`);
    // An icon on a painted body is content: giving it the body's colour would make it vanish.
    if (plan.bg === "none") {
      for (const s of plan.shapes) {
        const decl = [
          s.fillA != null && `fill: rgb(from ${hex} r g b / ${+s.fillA.toFixed(3)}) !important;`,
          s.strokeA != null && `stroke: rgb(from ${hex} r g b / ${+s.strokeA.toFixed(3)}) !important;`,
        ].filter(Boolean);
        if (decl.length) out.push(`${s.sel} { ${decl.join(" ")} }`);
      }
    }
  }
  return [own.length ? `${selector} { ${own.join(" ")} }` : "", ...out].filter(Boolean).join("\n");
}
