/**
 * Colour Lab: try new palettes on the running app. Pick a seed colour for the brand and the whole
 * brand scale is re-derived from it; the casing (neutral) scale can follow its hue; two supporting
 * scales follow a harmony. The app recolours live, because its colours are CSS variables: the lab
 * overrides the scale steps on :root, and every role and component that reads them follows.
 *
 * Contrast is checked live against the role pairings the app holds itself to. Keep candidates to
 * compare, ask Claude for palettes from a mood, and Save hands the chosen palette to Claude to write
 * into the app's tokens. Nothing changes in the code until then.
 *
 * Site-specific data (which variables, which steps, which pairings) comes from a PaletteSite; see
 * sites/mibbit-palette.ts.
 */
import { APPLIED_STYLE, CodeWriter, appliedRow } from "../applied";
import type { PanelControl } from "../dock";
import { HARMONIES, type Harmony, contrast, hexToLch, hueDelta, lchToHex, scaleAtHue, scaleFromSeed, turnScale } from "./palette";

export interface ScaleSpec {
  /** Variable prefix, e.g. "--brand" for --brand-50 … --brand-999. */
  prefix: string;
  label: string;
  /** What the scale is for, shown under its row. */
  hint?: string;
  /** The step the seed / harmony hue lands on (index into steps). */
  anchor: number;
}

export interface ContrastPair {
  fg: string;
  bg: string;
  /** Minimum ratio: 4.5 text, 3 indicators and outlines, 1 decorative (shown, never fails). */
  min: number;
  use: string;
}

export interface PaletteSite {
  /** Step names, lightest first, e.g. ["50", "100", …, "999"]. */
  steps: string[];
  brand: ScaleSpec;
  casing: ScaleSpec;
  /** The two supporting scales the harmony fills (second, third). */
  supporting: [ScaleSpec, ScaleSpec];
  /** Scales the lab never touches, shown for reference. */
  locked: ScaleSpec[];
  pairs: ContrastPair[];
  /** Quick seed picks: [name, hex]. */
  seeds: [string, string][];
  /** Quick mood picks for Ask Claude. */
  moods: string[];
  /**
   * Parts of the app that paint the brand with fixed colours instead of the variables (a canvas
   * mascot, say). The lab previews them by turning their hue with the brand (a CSS filter); the
   * real change needs their code to read the tokens, which every save lists.
   */
  followers?: { selector: string; label: string }[];
  /** Other places with the old brand colour fixed in code, listed in saves for whoever applies them. */
  hardcoded?: string[];
}

export interface LabOptions {
  /** Show the panel's own pill. Off when a dock opens it instead. Default on. */
  launcher?: boolean;
  site: PaletteSite;
  /** The helper's endpoint (…/__page-editor). */
  endpoint: string;
  storagePrefix: string;
}

type HarmonyChoice = Harmony | "keep";

interface LabState {
  seed: string;
  casingFollow: boolean;
  /** Casing chroma multiplier, 1 = as designed, 0 = pure grey. */
  casingTint: number;
  harmony: HarmonyChoice;
}

interface Candidate extends LabState {
  name: string;
  why?: string;
}

interface Scales {
  brand: string[];
  casing: string[];
  second: string[];
  third: string[];
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.pill { position: fixed; left: 18px; bottom: 64px; z-index: 2147483500; display: flex; align-items: center; gap: 8px; padding: 8px 14px 8px 10px; border-radius: 999px; cursor: pointer;
  background: rgba(22, 25, 31, 0.94); color: #f3f6fa; font: 700 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; letter-spacing: 0.02em;
  border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); }
.pill i { width: 16px; height: 16px; border-radius: 50%; background: conic-gradient(var(--seed, #AA0017) 0 50%, #1c1a1a 0); border: 1px solid rgba(255,255,255,.4); }
.pill:hover { border-color: #ff8a65; }
.panel { position: fixed; left: 18px; top: 84px; width: 340px; max-height: calc(100vh - 110px); z-index: 2147483600; display: flex; flex-direction: column;
  color: #e9edf3; font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  background: rgba(22, 25, 31, 0.95); -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.4); }
.head { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; cursor: grab; user-select: none; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.head b { flex: 1; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
.head .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--seed, #AA0017); box-shadow: 0 0 0 3px rgba(255,255,255,.12); }
.body { overflow-y: auto; padding: 10px 12px 6px; display: grid; gap: 12px; }
h4 { margin: 0 0 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa6b6; display: flex; align-items: baseline; gap: 8px; }
h4 span { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 600; color: #c8d2df; }
button { font: inherit; color: inherit; cursor: pointer; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.07); padding: 6px 9px; font-weight: 600; }
button:hover { background: rgba(255, 255, 255, 0.13); }
button.on { background: #ff8a65; color: #1d0c05; border-color: #ff8a65; }
button.primary { background: #ff8a65; color: #1d0c05; border-color: #ff8a65; }
button.primary:hover { background: #ffa384; }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #ff8a65; outline-offset: 2px; }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.seed { display: grid; grid-template-columns: 46px 1fr; gap: 10px; align-items: center; }
.seed label.big { position: relative; width: 46px; height: 46px; border-radius: 10px; border: 1px solid rgba(255,255,255,.25); background: var(--seed); cursor: pointer; overflow: hidden; }
.seed input[type=color] { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; border: 0; padding: 0; }
input[type=text], textarea { font: 600 12px/1.3 ui-monospace, "SF Mono", Menlo, monospace; color: #f3f6fa; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 6px 8px; width: 100%; }
textarea { font-family: inherit; font-weight: 500; resize: vertical; min-height: 38px; }
.slider { display: grid; grid-template-columns: 62px 1fr 42px; gap: 8px; align-items: center; color: #b9c4d2; }
.slider output { text-align: right; font: 600 11px ui-monospace, Menlo, monospace; color: #e9edf3; }
input[type=range] { width: 100%; accent-color: #ff8a65; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chips button { padding: 4px 8px; font-size: 11px; display: flex; align-items: center; gap: 6px; border-radius: 999px; }
.chips button i { width: 11px; height: 11px; border-radius: 50%; border: 1px solid rgba(255,255,255,.35); }
.scale { margin-top: 2px; }
.scale .name { display: flex; justify-content: space-between; font-size: 11px; color: #c8d2df; margin-bottom: 3px; }
.scale .name em { font-style: normal; color: #7e8a9a; }
.strip { display: grid; grid-template-columns: repeat(var(--n, 13), 1fr); height: 22px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,.12); }
.strip i { display: block; position: relative; }
.strip i.anchor::after { content: ""; position: absolute; left: 50%; bottom: 2px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.6); }
.strip.mini { height: 10px; border-radius: 4px; }
.check { display: flex; align-items: center; gap: 7px; color: #c8d2df; cursor: pointer; }
.check input { accent-color: #ff8a65; }
.score { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); cursor: pointer; width: 100%; text-align: left; }
.score b { font-size: 13px; }
.score.ok b { color: #7ee08a; } .score.bad b { color: #ff9a8a; }
.score em { margin-left: auto; font-style: normal; color: #9aa6b6; font-weight: 600; }
.pairs { display: grid; gap: 4px; margin-top: 6px; max-height: 220px; overflow-y: auto; }
.pair { display: grid; grid-template-columns: 26px 1fr auto; gap: 8px; align-items: center; font-size: 11px; color: #c8d2df; }
.pair .chip { width: 26px; height: 18px; border-radius: 4px; display: grid; place-items: center; font: 700 10px/1 ui-monospace, Menlo, monospace; border: 1px solid rgba(255,255,255,.15); }
.pair b { font: 700 11px ui-monospace, Menlo, monospace; }
.pair.fail b { color: #ff9a8a; } .pair.pass b { color: #7ee08a; } .pair.deco b { color: #7e8a9a; }
.cards { display: grid; gap: 6px; }
.card { display: grid; gap: 5px; padding: 8px 9px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); cursor: pointer; text-align: left; }
.card:hover, .card.on { border-color: #ff8a65; background: rgba(255,138,101,.1); }
.card .top { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #f3f6fa; }
.card .top i { width: 14px; height: 14px; border-radius: 4px; border: 1px solid rgba(255,255,255,.3); }
.card .top span { margin-left: auto; font-weight: 600; font-size: 10.5px; color: #9aa6b6; }
.card p { margin: 0; color: #aab5c3; font-size: 11px; }
.card .x { margin-left: 4px; padding: 0 6px; border: 0; background: none; color: #7e8a9a; }
.card .x:hover { color: #ff9a8a; }
.note { color: #8e9aab; font-size: 11px; margin: 4px 0 0; }
.head, .status, .foot, .applied { flex: none; }
.status { min-height: 16px; color: #b7f0c0; font-size: 11px; padding: 0 12px 8px; }
.status.err { color: #ff9a8a; }
.foot { display: flex; gap: 6px; padding: 10px 12px 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.foot .primary { flex: 1; }
.busy { opacity: .7; pointer-events: none; }
${APPLIED_STYLE}`;

const HTML = `
<button class="pill" data-act="open" title="Colour Lab"><i></i>Colour Lab</button>
<div class="panel" hidden>
  <div class="head"><span class="dot"></span><b>Colour Lab</b>
    <button data-act="compare" title="Hold to see the app's own colours (or press O)">Original</button>
    <button data-act="close" title="Fold">–</button>
  </div>
  <div class="body">
    <section>
      <h4>Brand <span data-out="anchor"></span></h4>
      <div class="seed">
        <label class="big" title="Pick a colour"><input type="color" data-in="picker"></label>
        <div><input type="text" data-in="hex" spellcheck="false" maxlength="7"><p class="note" data-out="seed-note"></p></div>
      </div>
      <div class="chips" data-out="seeds" style="margin-top:8px"></div>
      <div style="display:grid;gap:4px;margin-top:8px">
        <label class="slider">Hue <input type="range" data-in="H" min="0" max="360" step="1"><output data-out="H"></output></label>
        <label class="slider">Chroma <input type="range" data-in="C" min="0" max="0.3" step="0.002"><output data-out="C"></output></label>
        <label class="slider">Lightness <input type="range" data-in="L" min="0.15" max="0.85" step="0.002"><output data-out="L"></output></label>
      </div>
    </section>
    <section>
      <h4>Casing <span data-out="casing-note"></span></h4>
      <label class="check"><input type="checkbox" data-in="follow"> Follows the brand's hue</label>
      <label class="slider" style="margin-top:4px">Tint <input type="range" data-in="tint" min="0" max="3" step="0.05"><output data-out="tint"></output></label>
    </section>
    <section>
      <h4>Supporting colours</h4>
      <div class="row" data-out="harmonies"></div>
    </section>
    <section data-out="scales"></section>
    <section>
      <h4>Contrast</h4>
      <button class="score" data-act="pairs"><b data-out="score"></b><span data-out="score-note"></span><em data-out="score-open">show</em></button>
      <div class="pairs" data-out="pairs" hidden></div>
    </section>
    <section>
      <h4>Ask Claude</h4>
      <textarea data-in="mood" rows="2" placeholder="A mood, e.g. late-night studio, warmer, less alarm-red"></textarea>
      <div class="chips" data-out="moods" style="margin-top:6px"></div>
      <div class="row" style="margin-top:6px"><button data-act="ask">✦ Suggest 3 palettes</button></div>
      <div class="cards" data-out="ideas" style="margin-top:6px"></div>
    </section>
    <section>
      <h4>Kept <span data-out="kept-count"></span></h4>
      <div class="row"><input type="text" data-in="name" placeholder="Name this one" style="flex:1;font-family:inherit"><button data-act="keep">Keep</button></div>
      <div class="cards" data-out="kept" style="margin-top:6px"></div>
    </section>
  </div>
  <div class="status" data-out="status"></div>
  <div data-out="applied"></div>
  <div class="foot">
    <button data-act="reset" title="Back to the app's own colours">Reset</button>
    <button class="primary" data-act="save" title="Write this palette into the app's colour tokens (on the project's branch)">Put it in the app</button>
  </div>
</div>`;

/** Any CSS colour → #RRGGBB (through a 1px canvas, so oklab() and color-mix() work too). */
let paint: CanvasRenderingContext2D | null = null;
function cssToHex(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
  paint ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!paint || !v) return null;
  paint.clearRect(0, 0, 1, 1);
  paint.fillStyle = "#010203";
  paint.fillStyle = v;
  if (paint.fillStyle === "#010203" && v !== "#010203") return null;
  paint.fillRect(0, 0, 1, 1);
  const [r, g, b] = paint.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

const fmt = (n: number, d = 2) => n.toFixed(d);
const same = (a: LabState, b: LabState) => a.seed.toUpperCase() === b.seed.toUpperCase() && a.casingFollow === b.casingFollow && Math.abs(a.casingTint - b.casingTint) < 1e-6 && a.harmony === b.harmony;

let mounted = false;

export function mountColourLab(options: LabOptions): PanelControl | null {
  if (mounted || document.getElementById("colour-lab")) return null;
  mounted = true;
  const { site, endpoint, storagePrefix } = options;
  const steps = site.steps;
  const rootStyle = getComputedStyle(document.documentElement);
  const read = (spec: ScaleSpec) => steps.map((s) => cssToHex(rootStyle.getPropertyValue(`${spec.prefix}-${s}`)) ?? "#000000");

  // The app's own scales, read before the lab overrides anything.
  const ref: Scales = { brand: read(site.brand), casing: read(site.casing), second: read(site.supporting[0]), third: read(site.supporting[1]) };
  const ORIGINAL: LabState = { seed: ref.brand[site.brand.anchor], casingFollow: true, casingTint: 1, harmony: "keep" };

  const stateKey = `${storagePrefix}:colour:state`;
  const keptKey = `${storagePrefix}:colour:kept`;
  const ideasKey = `${storagePrefix}:colour:ideas`;
  const openKey = `${storagePrefix}:colour:open`;
  const load = <T>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const store = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private window: the lab still works, it just won't remember */
    }
  };

  let state: LabState = { ...ORIGINAL, ...load<Partial<LabState>>(stateKey, {}) };
  let kept: Candidate[] = load<Candidate[]>(keptKey, []);
  let ideas: Candidate[] = load<Candidate[]>(ideasKey, []);
  let comparing = false;
  let showPairs = false;
  const writer = new CodeWriter(endpoint, storagePrefix, "colour");

  // ---- the override sheet: unlayered :root rules beat the app's layered tokens

  const sheet = document.createElement("style");
  sheet.id = "colour-lab-vars";
  document.head.appendChild(sheet);

  function scalesFor(s: LabState): Scales {
    const seedLch = hexToLch(s.seed);
    const refLch = hexToLch(ref.brand[site.brand.anchor]);
    const turn = hueDelta(refLch.H, seedLch.H);
    const brand = s.seed.toUpperCase() === ORIGINAL.seed.toUpperCase() ? ref.brand : scaleFromSeed(ref.brand, s.seed, site.brand.anchor);
    const casingTurn = s.casingFollow ? turn : 0;
    const casing = Math.abs(casingTurn) < 0.01 && Math.abs(s.casingTint - 1) < 1e-6 ? ref.casing : turnScale(ref.casing, casingTurn, s.casingTint);
    if (s.harmony === "keep") return { brand, casing, second: ref.second, third: ref.third };
    const h = HARMONIES[s.harmony];
    return {
      brand,
      casing,
      second: scaleAtHue(ref.second, site.supporting[0].anchor, seedLch.H + h.second, h.chroma[0]),
      third: scaleAtHue(ref.third, site.supporting[1].anchor, seedLch.H + h.third, h.chroma[1]),
    };
  }

  const specs = () => [site.brand, site.casing, site.supporting[0], site.supporting[1]] as const;
  function cssFor(sc: Scales): string {
    const list = [sc.brand, sc.casing, sc.second, sc.third];
    const refs = [ref.brand, ref.casing, ref.second, ref.third];
    const decls: string[] = [];
    specs().forEach((spec, k) => {
      if (list[k] === refs[k]) return;
      steps.forEach((step, i) => decls.push(`${spec.prefix}-${step}: ${list[k][i]};`));
    });
    let css = decls.length ? `:root {\n  ${decls.join("\n  ")}\n}` : "";
    // Fixed-colour parts follow the brand's hue and colourfulness by filter (a preview only).
    if (sc.brand !== ref.brand && site.followers?.length) {
      const from = hexToLch(ref.brand[site.brand.anchor]);
      const to = hexToLch(sc.brand[site.brand.anchor]);
      const turn = hueDelta(from.H, to.H);
      const sat = from.C > 0.002 ? to.C / from.C : 1;
      const light = from.L > 0.01 ? to.L / from.L : 1;
      css += `\n${site.followers.map((f) => f.selector).join(", ")} { filter: hue-rotate(${turn.toFixed(1)}deg) saturate(${sat.toFixed(2)}) brightness(${light.toFixed(2)}); }`;
    }
    return css;
  }

  // ---- the panel

  const host = document.createElement("div");
  host.id = "colour-lab";
  host.setAttribute("data-review-tool", "");
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>${HTML}`;
  const $ = <T extends HTMLElement>(q: string) => root.querySelector(q) as T;
  const out = (name: string) => $(`[data-out="${name}"]`);
  const input = (name: string) => $<HTMLInputElement>(`[data-in="${name}"]`);
  const pill = $(".pill");
  const panel = $(".panel");

  const say = (text: string, err = false) => {
    const el = out("status");
    // Long answers (Claude's summaries) stay short here; the whole text is on hover.
    el.textContent = text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
    el.title = text.length > 220 ? text : "";
    el.classList.toggle("err", err);
  };

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    pill.hidden = open || options.launcher === false;
    store(openKey, open);
    if (open) window.dispatchEvent(new CustomEvent("review-tool:open", { detail: "colour-lab" }));
  };
  // Another left-side tool opened: fold out of its way.
  window.addEventListener("review-tool:open", (e) => {
    if ((e as CustomEvent).detail !== "colour-lab" && !panel.hidden) setOpen(false);
  });

  const strip = (hexes: string[], anchor?: number, mini = false) =>
    `<div class="strip${mini ? " mini" : ""}" style="--n:${hexes.length}">${hexes
      .map((h, i) => `<i class="${i === anchor && !mini ? "anchor" : ""}" style="background:${h}" title="${steps[i]} ${h}"></i>`)
      .join("")}</div>`;

  /** Each contrast pairing as it resolves on the page right now. */
  function checkContrast() {
    const cs = getComputedStyle(document.documentElement);
    return site.pairs.map((p) => {
      const fg = cssToHex(cs.getPropertyValue(p.fg));
      const bg = cssToHex(cs.getPropertyValue(p.bg));
      const ratio = fg && bg ? contrast(fg, bg) : NaN;
      const verdict = p.min <= 1 ? "deco" : Number.isNaN(ratio) ? "unknown" : ratio >= p.min ? "pass" : "fail";
      return { ...p, fgHex: fg, bgHex: bg, ratio, verdict };
    });
  }

  let frame = 0;
  function apply(save = true) {
    const sc = scalesFor(state);
    sheet.textContent = comparing ? "" : cssFor(sc);
    host.style.setProperty("--seed", state.seed);
    if (save) store(stateKey, state);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => render(sc));
  }

  function render(sc: Scales) {
    const lch = hexToLch(state.seed);
    const picker = input("picker");
    if (root.activeElement !== picker) picker.value = state.seed.toLowerCase();
    const hex = input("hex");
    if (root.activeElement !== hex) hex.value = state.seed.toUpperCase();
    for (const [k, v, d] of [["H", lch.H, 0], ["C", lch.C, 3], ["L", lch.L, 3]] as const) {
      const range = input(k);
      if (root.activeElement !== range) range.value = String(v);
      out(k).textContent = fmt(v, d);
    }
    out("anchor").textContent = `seed = ${site.brand.prefix}-${steps[site.brand.anchor]}`;
    out("seed-note").textContent = state.seed.toUpperCase() === ORIGINAL.seed.toUpperCase() ? "The app's own brand colour." : `Was ${ORIGINAL.seed}.`;
    input("follow").checked = state.casingFollow;
    input("tint").value = String(state.casingTint);
    out("tint").textContent = `${Math.round(state.casingTint * 100)}%`;
    out("casing-note").textContent = state.casingTint === 0 ? "pure grey" : state.casingFollow ? "turns with the brand" : "keeps its hue";

    out("seeds").innerHTML = site.seeds
      .map(([name, h]) => `<button data-seed="${h}" class="${h.toUpperCase() === state.seed.toUpperCase() ? "on" : ""}"><i style="background:${h}"></i>${name}</button>`)
      .join("");
    out("harmonies").innerHTML = (["keep", ...Object.keys(HARMONIES)] as HarmonyChoice[])
      .map((k) => `<button data-harmony="${k}" class="${state.harmony === k ? "on" : ""}">${k === "keep" ? "As designed" : HARMONIES[k as Harmony].label}</button>`)
      .join("");

    const rows = [
      [site.brand, sc.brand],
      [site.casing, sc.casing],
      [site.supporting[0], sc.second],
      [site.supporting[1], sc.third],
    ] as const;
    out("scales").innerHTML =
      `<h4>Scales <span>${comparing ? "showing the original" : "live on the page"}</span></h4>` +
      rows.map(([spec, hexes]) => `<div class="scale"><div class="name">${spec.label}<em>${spec.hint ?? ""}</em></div>${strip(hexes, spec.anchor)}</div>`).join("") +
      (site.locked.length ? `<p class="note">Locked: ${site.locked.map((s) => s.label).join(", ")}.</p>` : "") +
      (site.followers?.length ? `<p class="note">${site.followers.map((f) => f.label).join(", ")}: colours fixed in code, previewed by turning their hue.</p>` : "");

    const checks = checkContrast();
    const rated = checks.filter((c) => c.verdict === "pass" || c.verdict === "fail");
    const fails = rated.filter((c) => c.verdict === "fail");
    const score = out("score");
    score.textContent = `${rated.length - fails.length} / ${rated.length} pass`;
    score.parentElement!.className = `score ${fails.length ? "bad" : "ok"}`;
    out("score-note").textContent = fails.length ? `${fails.length} below the floor` : "every pairing clears its floor";
    out("score-open").textContent = showPairs ? "hide" : "show";
    const pairs = out("pairs");
    pairs.hidden = !showPairs;
    if (showPairs) {
      const order = { fail: 0, unknown: 1, pass: 2, deco: 3 } as const;
      pairs.innerHTML = [...checks]
        .sort((a, b) => order[a.verdict as keyof typeof order] - order[b.verdict as keyof typeof order])
        .map(
          (c) =>
            `<div class="pair ${c.verdict}" title="${c.fg} on ${c.bg}"><span class="chip" style="color:${c.fgHex};background:${c.bgHex}">Aa</span><span>${c.use}</span><b>${Number.isNaN(c.ratio) ? "?" : fmt(c.ratio, 1)}${c.min > 1 ? ` / ${c.min}` : ""}</b></div>`,
        )
        .join("");
    }

    const card = (c: Candidate, i: number, list: "ideas" | "kept") => {
      const s = scalesFor(c);
      const on = same(c, state);
      return `<div class="card${on ? " on" : ""}" data-${list}="${i}" role="button" tabindex="0">
        <div class="top"><i style="background:${c.seed}"></i>${escapeHtml(c.name)}<span>${c.harmony === "keep" ? "" : HARMONIES[c.harmony].label}</span>${list === "kept" ? `<button class="x" data-drop="${i}" title="Forget">✕</button>` : ""}</div>
        ${strip(s.brand, undefined, true)}${strip(s.casing, undefined, true)}
        ${c.why ? `<p>${escapeHtml(c.why)}</p>` : ""}
      </div>`;
    };
    out("ideas").innerHTML = ideas.map((c, i) => card(c, i, "ideas")).join("");
    out("kept").innerHTML = kept.map((c, i) => card(c, i, "kept")).join("");
    out("kept-count").textContent = kept.length ? String(kept.length) : "";
    out("moods").innerHTML = site.moods.map((m) => `<button data-mood="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join("");
    $<HTMLButtonElement>("[data-act=compare]").classList.toggle("on", comparing);
    out("applied").innerHTML = appliedRow(writer.last, escapeHtml);
  }

  const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  const setSeed = (hex: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    state = { ...state, seed: hex.toUpperCase() };
    apply();
  };

  // ---- inputs

  input("picker").addEventListener("input", (e) => setSeed((e.target as HTMLInputElement).value));
  input("hex").addEventListener("input", (e) => {
    const v = (e.target as HTMLInputElement).value.trim();
    setSeed(v.startsWith("#") ? v : `#${v}`);
  });
  for (const k of ["H", "C", "L"] as const) {
    input(k).addEventListener("input", (e) => {
      const lch = hexToLch(state.seed);
      lch[k] = Number((e.target as HTMLInputElement).value);
      setSeed(lchToHex(lch));
    });
  }
  input("follow").addEventListener("change", (e) => {
    state = { ...state, casingFollow: (e.target as HTMLInputElement).checked };
    apply();
  });
  input("tint").addEventListener("input", (e) => {
    state = { ...state, casingTint: Number((e.target as HTMLInputElement).value) };
    apply();
  });

  const pickCard = (c: Candidate) => {
    state = { seed: c.seed, casingFollow: c.casingFollow, casingTint: c.casingTint, harmony: c.harmony };
    apply();
    say(`Showing “${c.name}”.`);
  };

  root.addEventListener("click", (event) => {
    const t = event.target as HTMLElement;
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    const seed = t.closest<HTMLElement>("[data-seed]")?.dataset.seed;
    const harmony = t.closest<HTMLElement>("[data-harmony]")?.dataset.harmony as HarmonyChoice | undefined;
    const mood = t.closest<HTMLElement>("[data-mood]")?.dataset.mood;
    const drop = t.closest<HTMLElement>("[data-drop]")?.dataset.drop;
    const idea = t.closest<HTMLElement>("[data-ideas]")?.dataset.ideas;
    const keptAt = t.closest<HTMLElement>("[data-kept]")?.dataset.kept;
    if (drop != null) {
      kept.splice(Number(drop), 1);
      store(keptKey, kept);
      apply(false);
    } else if (seed) setSeed(seed);
    else if (harmony) {
      state = { ...state, harmony };
      apply();
    } else if (mood) {
      const box = input("mood") as unknown as HTMLTextAreaElement;
      box.value = box.value.trim() ? `${box.value.trim()}, ${mood.toLowerCase()}` : mood;
    } else if (idea != null) pickCard(ideas[Number(idea)]);
    else if (keptAt != null) pickCard(kept[Number(keptAt)]);
    else if (act === "open") setOpen(true);
    else if (act === "close") setOpen(false);
    else if (act === "pairs") {
      showPairs = !showPairs;
      apply(false);
    } else if (act === "reset") {
      state = { ...ORIGINAL };
      apply();
      say("Back to the app's own colours.");
    } else if (act === "keep") keep();
    else if (act === "ask") void ask();
    else if (act === "save") void save();
    else if (act === "undo-apply") void undoApply();
  });

  // Original: hold the button (or O) to see the app's own colours; a click toggles.
  const compareBtn = $<HTMLButtonElement>("[data-act=compare]");
  let held = 0;
  compareBtn.addEventListener("pointerdown", () => {
    held = window.setTimeout(() => {
      held = -1;
      comparing = true;
      apply(false);
    }, 250);
  });
  compareBtn.addEventListener("pointerup", (e) => {
    if (held === -1) {
      comparing = false;
      apply(false);
      e.stopPropagation();
    } else {
      window.clearTimeout(held);
      comparing = !comparing;
      apply(false);
    }
    held = 0;
  });
  compareBtn.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener(
    "keydown",
    (e) => {
      if (panel.hidden || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "o") return;
      if (e.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || (n instanceof HTMLElement && n.isContentEditable))) return;
      e.preventDefault();
      e.stopPropagation();
      comparing = true;
      apply(false);
    },
    true,
  );
  document.addEventListener(
    "keyup",
    (e) => {
      if (!comparing || e.key.toLowerCase() !== "o") return;
      comparing = false;
      apply(false);
    },
    true,
  );

  function keep() {
    const nameBox = input("name");
    const name = nameBox.value.trim() || `${state.seed}${state.harmony === "keep" ? "" : ` · ${HARMONIES[state.harmony].label}`}`;
    kept = [{ ...state, name }, ...kept.filter((k) => k.name !== name)].slice(0, 24);
    store(keptKey, kept);
    nameBox.value = "";
    apply(false);
    say(`Kept “${name}”.`);
  }

  async function ask() {
    const box = input("mood") as unknown as HTMLTextAreaElement;
    const words = box.value.trim();
    if (!words) return say("Describe a mood first, or tap a quick pick.", true);
    const btn = $<HTMLButtonElement>("[data-act=ask]");
    btn.disabled = true;
    btn.textContent = "Asking Claude…";
    say("Claude is mixing palettes (about 15 seconds).");
    try {
      const res = await fetch(`${endpoint}/palette`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mood: words,
          current: { seed: state.seed, harmony: state.harmony, casingTint: state.casingTint, brand: scalesFor(state).brand },
          original: { seed: ORIGINAL.seed, brand: ref.brand, casing: ref.casing },
          kept: kept.map((k) => k.seed),
          harmonies: Object.keys(HARMONIES),
        }),
      });
      const data = (await res.json()) as { palettes?: { name: string; seed: string; harmony: string; casingTint: number; casingFollow: boolean; why: string }[]; error?: string };
      if (!res.ok || !data.palettes) throw new Error(data.error ?? `The helper answered ${res.status}.`);
      ideas = data.palettes
        .filter((p) => /^#[0-9a-f]{6}$/i.test(p.seed))
        .map((p) => ({
          name: p.name,
          why: p.why,
          seed: p.seed.toUpperCase(),
          harmony: (p.harmony in HARMONIES ? p.harmony : "keep") as HarmonyChoice,
          casingTint: Math.min(3, Math.max(0, Number(p.casingTint) || 1)),
          casingFollow: p.casingFollow !== false,
        }));
      store(ideasKey, ideas);
      apply(false);
      say(`${ideas.length} palettes. Click one to try it on the app.`);
    } catch (e) {
      say(`Couldn't get palettes: ${(e as Error).message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "✦ Suggest 3 palettes";
    }
  }

  async function save() {
    if (same(state, ORIGINAL)) return say("This is the app's own palette; there's nothing to save.", true);
    const sc = scalesFor(state);
    const checks = checkContrast();
    const name = input("name").value.trim() || kept.find((k) => same(k, state))?.name || state.seed;
    const list = [sc.brand, sc.casing, sc.second, sc.third];
    const refs = [ref.brand, ref.casing, ref.second, ref.third];
    const byStep = (hexes: string[]) => Object.fromEntries(steps.map((s, i) => [s, hexes[i]]));
    const changed = specs()
      .map((spec, k) => ({ prefix: spec.prefix, now: list[k], before: refs[k] }))
      .filter((c) => c.now !== c.before);
    const payload = {
      name,
      savedAt: new Date().toISOString(),
      url: location.href,
      note: "A palette from the Colour Lab. scales holds every step to write into the tokens file (only scales that changed); was holds the app's values before. settings re-creates it in the lab. fixedInCode lists places that paint the old brand with fixed colours, which need their code changed to follow. contrast lists pairings below their floor at save time.",
      settings: state,
      scales: Object.fromEntries(changed.map((c) => [c.prefix, byStep(c.now)])),
      was: Object.fromEntries(changed.map((c) => [c.prefix, byStep(c.before)])),
      fixedInCode: [...(site.followers ?? []).map((f) => `${f.label} (${f.selector}): previewed by hue filter only`), ...(site.hardcoded ?? [])],
      contrast: {
        failing: checks.filter((c) => c.verdict === "fail").map((c) => ({ fg: c.fg, bg: c.bg, ratio: Number(fmt(c.ratio, 2)), min: c.min, use: c.use })),
        rated: checks.filter((c) => c.verdict === "pass" || c.verdict === "fail").length,
      },
    };
    try {
      const res = await fetch(`${endpoint}/palette-save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json()) as { file?: string; name?: string; canApply?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `The helper answered ${res.status}.`);
      if (!data.canApply || !data.name) return say(`Saved “${name}”. Ask Claude to apply it to the tokens.`);
      const btn = $<HTMLButtonElement>("[data-act=save]");
      btn.disabled = true;
      btn.textContent = "Writing it in…";
      say("Writing the palette into the app's colour tokens and re-checking contrast.");
      try {
        const done = await writer.apply("palette", data.name, name);
        // The tokens now hold this palette: start the lab fresh from them.
        state = { ...ORIGINAL };
        store(stateKey, state);
        say(`${done.summary} Reloading with it as the app's own colours.`);
        window.setTimeout(() => location.reload(), 1600);
      } finally {
        btn.disabled = false;
        btn.textContent = "Put it in the app";
      }
    } catch (e) {
      say(`Couldn't put it in the app: ${(e as Error).message}`, true);
    }
  }

  async function undoApply() {
    // Forget the lab's own preview first: the dev server may reload the page before Undo answers,
    // and the app should come back in its restored colours, not this palette on top.
    const keep = state;
    try {
      localStorage.removeItem(stateKey);
    } catch {
      /* fine */
    }
    try {
      say("Taking it back out of the code…");
      const summary = await writer.undo();
      say(`${summary} Reloading.`);
      window.setTimeout(() => location.reload(), 1200);
    } catch (e) {
      store(stateKey, keep);
      say(`Couldn't undo: ${(e as Error).message}`, true);
    }
  }

  // Drag by the header.
  const head = $(".head");
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const start = { x: e.clientX, y: e.clientY, left: panel.offsetLeft, top: panel.offsetTop };
    head.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      panel.style.left = `${Math.max(0, start.left + m.clientX - start.x)}px`;
      panel.style.top = `${Math.max(0, start.top + m.clientY - start.y)}px`;
    };
    const up = () => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
  });

  // Keep app shortcuts out of the lab's text fields.
  root.addEventListener("keydown", (e) => e.stopPropagation());

  setOpen(load(openKey, false));
  apply(false);
  // An apply that was still running when the page reloaded: pick up how it went.
  const recover = async () => {
    const got = await writer.recover();
    if (got === "waiting") {
      say("Still writing it into the code…");
      window.setTimeout(recover, 3000);
    } else if (got) {
      // The tokens hold the palette now; the lab's own override would double it.
      state = { ...ORIGINAL };
      say(`In the app: ${got.summary}`);
      apply();
    }
  };
  void recover();

  if (!same(state, ORIGINAL)) say("Your last palette is on. Reset goes back to the app's own.");

  return { open: () => setOpen(true), close: () => setOpen(false), isOpen: () => !panel.hidden };
}
