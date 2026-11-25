/**
 * Fonts for the Type Lab: a catalogue of Google web fonts, loading any of them (or a font the page
 * already has), and re-issuing its faces under a role's own name so the role can be resized
 * (size-adjust) without touching a single font-size in the app.
 *
 * Google's CSS API v1 is used on purpose: it answers with whatever weights a family has (v2 refuses
 * a list naming a weight the family lacks), and its CSS is CORS-open, so the page can read it.
 */

export type FontKind = "mono" | "sans" | "tech" | "pixel" | "serif";

export interface CatalogueFont {
  family: string;
  kind: FontKind;
}

export const KINDS: { id: FontKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mono", label: "Mono" },
  { id: "sans", label: "Sans" },
  { id: "tech", label: "Techno" },
  { id: "pixel", label: "Pixel & LCD" },
  { id: "serif", label: "Serif" },
];

const list = (kind: FontKind, names: string) => names.split("|").map((family) => ({ family, kind }));

export const CATALOGUE: CatalogueFont[] = [
  ...list("mono", "Geist Mono|JetBrains Mono|IBM Plex Mono|Space Mono|DM Mono|Fragment Mono|Martian Mono|Red Hat Mono|Azeret Mono|Spline Sans Mono|Chivo Mono|Sometype Mono|Reddit Mono|Roboto Mono|Source Code Pro|Fira Code|Ubuntu Mono|Cousine|Victor Mono|Kode Mono|Courier Prime|Overpass Mono|Anonymous Pro|Xanh Mono|Sono"),
  ...list("sans", "Geist|Inter|Inter Tight|Space Grotesk|DM Sans|Manrope|IBM Plex Sans|IBM Plex Sans Condensed|Instrument Sans|Schibsted Grotesk|Hanken Grotesk|Familjen Grotesk|Bricolage Grotesque|Work Sans|Archivo|Archivo Narrow|Sora|Outfit|Plus Jakarta Sans|Figtree|Onest|Albert Sans|Public Sans|Rubik|Barlow|Barlow Condensed|Mona Sans|Hubot Sans|Atkinson Hyperlegible|Lexend"),
  ...list("tech", "Michroma|Chakra Petch|Rajdhani|Oxanium|Tomorrow|Tektur|Anta|Orbitron|Audiowide|Zen Dots|Turret Road|Exo 2|Saira|Saira Condensed|Bai Jamjuree|Teko|Krona One|Syne|Unbounded|Big Shoulders Display|Bungee|Major Mono Display"),
  ...list("pixel", "Silkscreen|Pixelify Sans|VT323|Press Start 2P|Jersey 10|Tiny5|Micro 5|Workbench|Doto|Sixtyfour|Handjet|DotGothic16|Share Tech Mono"),
  ...list("serif", "Instrument Serif|Fraunces|Newsreader|Young Serif|DM Serif Display|Playfair Display|IBM Plex Serif|EB Garamond|Libre Caslon Text|Bodoni Moda|Gloock"),
];

export interface Face {
  style: string;
  /** "400", or a range "100 900" for a variable face. */
  weight: string;
  /** The src descriptor as written (url(...) format(...)). */
  src: string;
  range: string;
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const plus = (family: string) => family.trim().replace(/\s+/g, "+");

/** The v1 stylesheet URL for some families, every weight upright and italic. */
export const googleCssUrl = (families: string[]) =>
  `https://fonts.googleapis.com/css?family=${families.map((f) => `${plus(f)}:${WEIGHTS.join(",")},${WEIGHTS.map((w) => `${w}i`).join(",")}`).join("|")}&display=swap`;

export function parseFaces(css: string): Face[] {
  const faces: Face[] = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1];
    const get = (prop: string) => body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`))?.[1].trim() ?? "";
    const src = get("src");
    if (!src) continue;
    faces.push({ style: get("font-style") || "normal", weight: get("font-weight") || "400", src, range: get("unicode-range") });
  }
  return faces;
}

const googleCache = new Map<string, Promise<Face[]>>();

/** Every face Google has for a family (rejects when Google doesn't know it). */
export function googleFaces(family: string): Promise<Face[]> {
  const key = family.toLowerCase();
  let got = googleCache.get(key);
  if (!got) {
    got = fetch(googleCssUrl([family]))
      // Google answers an unknown family with a 400 that has no CORS header, so fetch just fails.
      .catch(() => {
        throw new Error(`Google Fonts doesn't have “${family}” (check the spelling), or it can't be reached.`);
      })
      .then((res) => {
        if (!res.ok) throw new Error(`Google Fonts doesn't have “${family}”.`);
        return res.text();
      })
      .then((css) => {
        const faces = parseFaces(css);
        if (!faces.length) throw new Error(`Google Fonts doesn't have “${family}”.`);
        return faces;
      });
    got.catch(() => googleCache.delete(key));
    googleCache.set(key, got);
  }
  return got;
}

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");

/** The faces the page itself declares for a family (its self-hosted fonts), with absolute URLs. */
export function pageFaces(family: string): Face[] {
  const want = family.toLowerCase();
  const faces: Face[] = [];
  const walk = (rules: CSSRuleList, base: string) => {
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        if (unquote(rule.style.getPropertyValue("font-family")).toLowerCase() !== want) continue;
        const src = rule.style.getPropertyValue("src").replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (_, _q, u: string) => `url("${new URL(u, base).href}")`);
        faces.push({
          style: rule.style.getPropertyValue("font-style") || "normal",
          weight: rule.style.getPropertyValue("font-weight") || "400",
          src,
          range: rule.style.getPropertyValue("unicode-range"),
        });
      } else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, base);
    }
  };
  for (const sheet of document.styleSheets) {
    if ((sheet.ownerNode as Element | null)?.closest?.("[data-review-tool]") || (sheet.ownerNode as Element | null)?.id === "type-lab-sheet") continue;
    try {
      walk(sheet.cssRules, sheet.href ?? location.href);
    } catch {
      /* another origin's sheet */
    }
  }
  return faces;
}

/** A family's faces: the page's own if it has them, else Google's. */
export async function facesFor(family: string): Promise<{ faces: Face[]; from: "page" | "google" }> {
  const own = pageFaces(family);
  if (own.length) return { faces: own, from: "page" };
  return { faces: await googleFaces(family), from: "google" };
}

/** @font-face rules that give a family's faces to another name, scaled by size-adjust. */
export function aliasFaces(alias: string, faces: Face[], sizePct: number): string {
  const size = Math.round(sizePct) === 100 ? "" : `size-adjust:${Math.round(sizePct)}%;`;
  return faces
    .map((f) => `@font-face{font-family:"${alias}";font-style:${f.style};font-weight:${f.weight};font-display:swap;src:${f.src};${f.range ? `unicode-range:${f.range};` : ""}${size}}`)
    .join("\n");
}

/** A tiny face for showing a font's name in its own letters (Google's text= subset). */
const swatchLoaded = new Set<string>();
export function loadSwatch(family: string, root: Document | ShadowRoot = document) {
  const key = family.toLowerCase();
  if (swatchLoaded.has(key)) return;
  swatchLoaded.add(key);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css?family=${plus(family)}&text=${encodeURIComponent(`${family}Aa0123456789`)}&display=swap`;
  link.setAttribute("data-review-tool", "");
  // @font-face only counts from the document, not from inside a shadow root.
  (root instanceof ShadowRoot ? document.head : root.head).appendChild(link);
}

/** The first family named in a font stack ("Departure Mono", "Geist Mono", …). */
export const firstFamily = (stack: string) => unquote(stack.split(",")[0] ?? "");
