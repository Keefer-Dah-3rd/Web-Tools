/**
 * Texture Lab: swap the app's surface finish, live. It reads the app's stylesheets for texture
 * (glossy domes and hot spots, hand-made bevels, knurls, the shared shadow and sheen roles), lets
 * you tick which of those to retexture, and swaps them for a finish from the gallery: flat matte,
 * powder coat, soft-touch rubber, brushed or bead-blasted metal, paper, felt, 1-bit dither… or one
 * you describe, which Claude writes as three textures in the same recipe language.
 *
 * Hover a finish to preview it, click to keep it on; the strength slider scales the whole finish.
 * "Put it in the app" hands the chosen finish to Claude to write into the tokens and the component
 * stylesheets it replaced, on the project's branch (like the Design Generator's apply).
 *
 * Everything is CSS: the app keeps working, and the mascot is never touched.
 */

import { APPLIED_STYLE, CodeWriter, appliedRow } from "../applied";
import { type SiteRules, lockedTokens } from "../site-rules";
import type { PanelControl } from "../dock";
import { CATS, type Cat, type Found, type Inks, PRESETS, ROLES, type Texture, buildCss, cleanValue, declsFor, resolve, scan, splitTop, tokensFor } from "./recipes";

export interface TextureSite {
  /** The colours the recipe language mixes: a near-white and a near-black custom property. */
  inks: Inks;
  /** Quick picks for "describe your own". */
  asks: string[];
}

export interface TextureOptions {
  launcher?: boolean;
  rules?: SiteRules;
  site: TextureSite;
  endpoint: string;
  storagePrefix: string;
}

interface State {
  on: string | null;
  strength: number;
  cats: Record<Cat, boolean>;
  excluded: string[];
}

const ACCENT = "#46d6b5";
const SHEET_ID = "texture-lab-sheet";

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.pill { position: fixed; left: 18px; bottom: 150px; z-index: 2147483500; display: flex; align-items: center; gap: 8px; padding: 8px 14px 8px 10px; border-radius: 999px; cursor: pointer;
  background: rgba(22, 25, 31, 0.94); color: #f3f6fa; font: 700 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); }
.pill b { color: ${ACCENT}; font-size: 14px; }
.panel { position: fixed; left: 18px; top: 84px; width: 360px; max-height: calc(100vh - 110px); z-index: 2147483600; display: flex; flex-direction: column;
  color: #e9edf3; font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  background: rgba(22, 25, 31, 0.95); -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.4); }
:host([data-docked]) .panel { left: 8px; top: 36px; max-height: calc(100vh - 84px); }
.head { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; user-select: none; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.head b { flex: 1; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
.head .dot { color: ${ACCENT}; font-size: 14px; }
.body { overflow-y: auto; padding: 10px 12px 6px; display: grid; gap: 14px; }
h4 { margin: 0 0 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa6b6; display: flex; align-items: baseline; gap: 8px; }
h4 span { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 600; color: #c8d2df; }
button { font: inherit; color: inherit; cursor: pointer; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.07); padding: 6px 9px; font-weight: 600; }
button:hover { background: rgba(255, 255, 255, 0.13); }
button.on, button.primary { background: ${ACCENT}; color: #04201a; border-color: ${ACCENT}; }
button.primary:hover { filter: brightness(1.1); }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.note { color: #8e9aab; font-size: 11px; margin: 0; }
.cats { display: grid; gap: 2px; }
.cat { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; padding: 5px 6px; border-radius: 8px; cursor: pointer; }
.cat:hover { background: rgba(255,255,255,.06); }
.cat input { accent-color: ${ACCENT}; margin: 0; }
.cat b { font-weight: 600; color: #e9edf3; }
.cat small { color: #8e9aab; font-weight: 600; font-variant-numeric: tabular-nums; }
details.rules { margin: 2px 0 0 26px; }
details.rules summary { cursor: pointer; color: #8e9aab; font-size: 10.5px; }
details.rules ul { list-style: none; margin: 4px 0 0; padding: 0; max-height: 160px; overflow: auto; display: grid; gap: 1px; }
details.rules li { display: flex; gap: 6px; align-items: center; font: 500 10.5px/1.3 ui-monospace, "SF Mono", Menlo, monospace; color: #cfd8e3; padding: 2px 4px; border-radius: 4px; }
details.rules li:hover { background: rgba(255,255,255,.06); }
details.rules li.off { opacity: .4; text-decoration: line-through; }
details.rules li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
details.rules li em { color: #7e8a9a; font-style: normal; }
details.rules li button { padding: 0 5px; border: 0; background: none; color: #7e8a9a; font-size: 11px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.tex { display: grid; gap: 5px; padding: 6px; border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); cursor: pointer; text-align: left; position: relative; }
.tex:hover { border-color: color-mix(in srgb, ${ACCENT} 60%, transparent); }
.tex.on { border-color: ${ACCENT}; background: color-mix(in srgb, ${ACCENT} 12%, transparent); }
.tex .name { font-weight: 700; color: #f3f6fa; font-size: 11.5px; display: flex; gap: 6px; align-items: center; }
.tex .name em { margin-left: auto; font-style: normal; font-size: 9.5px; font-weight: 700; color: ${ACCENT}; letter-spacing: .06em; text-transform: uppercase; }
.tex p { margin: 0; color: #9aa6b6; font-size: 10.5px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.tex .x { position: absolute; top: 3px; right: 3px; padding: 0 5px; border: 0; background: rgba(0,0,0,.5); color: #b9c3d0; font-size: 11px; border-radius: 6px; }
.tex .x:hover { color: #ff9a8a; }
/* The swatch: a key on a slab of casing, with a recessed well, in the app's own surface colours. */
.sw { position: relative; height: 56px; border-radius: 7px; overflow: hidden;
  background-color: var(--surface-base, #14110e); background-image: var(--ov, none); background-size: var(--ovs, auto); }
.sw .key { position: absolute; left: 10px; top: 10px; width: 36px; height: 36px; border-radius: 10px; background: var(--key); box-shadow: var(--f), var(--r); }
.sw .well { position: absolute; right: 10px; top: 15px; width: 54px; height: 26px; border-radius: 6px; background-color: var(--surface-recessed, #0d0b09); box-shadow: var(--p); }
.sw .well::after { content: ""; position: absolute; inset: 0; border-radius: inherit; background: var(--sheen, none); }
.strength { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; }
.strength input { accent-color: ${ACCENT}; width: 100%; }
.strength output { font-variant-numeric: tabular-nums; color: #c8d2df; font-weight: 700; min-width: 38px; text-align: right; }
textarea { font: 500 12px/1.35 inherit; font-family: inherit; color: #f3f6fa; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 6px 8px; width: 100%; resize: vertical; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.pics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.pics:empty { display: none; }
.pic { position: relative; width: 64px; height: 64px; border-radius: 7px; overflow: hidden; border: 1px solid rgba(255,255,255,.18); background: #000 center / cover no-repeat; }
.pic.wait { display: grid; place-items: center; font-size: 10px; color: #c8d2df; }
.pic .x { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; padding: 0; border-radius: 999px; font-size: 11px; line-height: 1; background: rgba(0,0,0,.7); }
.make.drag { outline: 2px dashed ${ACCENT}; outline-offset: 4px; border-radius: 8px; }
.chips button { padding: 4px 8px; font-size: 11px; border-radius: 999px; }
.head, .status, .foot, .applied { flex: none; }
.status { min-height: 16px; color: #bff3e6; font-size: 11px; padding: 0 12px 8px; }
.status.err { color: #ff9a8a; }
.foot { display: flex; gap: 6px; padding: 10px 12px 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.foot .primary { flex: 1; }
.outline { position: fixed; pointer-events: none; z-index: 2147483400; border-radius: 4px; outline: 2px solid ${ACCENT}; outline-offset: 1px; background: color-mix(in srgb, ${ACCENT} 10%, transparent); }
${APPLIED_STYLE}
`;

const HTML = `
<div data-out="outlines"></div>
<button class="pill" data-act="open" title="Texture Lab"><b>◍</b>Texture</button>
<div class="panel" hidden>
  <div class="head"><span class="dot">◍</span><b>Texture Lab</b>
    <button data-act="original" title="Hold to see the textures as designed (or hold O)">Original</button>
    <button data-act="close" title="Fold">–</button>
  </div>
  <div class="body">
    <section>
      <h4>Textures in the app <span data-out="found-count"></span></h4>
      <div class="cats" data-out="cats"></div>
      <div class="row" style="margin-top:6px"><button data-act="scan" title="Read the app's stylesheets again (after a code change)">⟳ Find again</button></div>
      <p class="note" style="margin-top:6px">Hover a kind to see where it is. Tick what the new texture should replace.</p>
    </section>
    <section>
      <h4>Swap to <span data-out="on-name"></span></h4>
      <div class="grid" data-out="presets"></div>
    </section>
    <section>
      <h4>Strength</h4>
      <div class="strength"><small class="note">Faint</small><input type="range" min="0" max="160" step="5" data-in="strength"><output data-out="strength"></output></div>
    </section>
    <section class="make">
      <h4>Make your own</h4>
      <textarea data-in="ask" rows="3" placeholder="Describe a texture, e.g. worn rubber from an old drum machine, slightly chalky, no shine"></textarea>
      <div class="pics" data-out="pics"></div>
      <div class="row" style="margin-top:6px"><button data-act="add-pic" title="Or paste an image (⌘V) or drop one here">＋ Image</button><small class="note">Paste (⌘V) or drop pictures of the look you want</small></div>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden data-in="pic-file">
      <div class="chips" data-out="asks" style="margin-top:6px"></div>
      <div class="row" style="margin-top:8px"><button class="primary" data-act="make">◍ Make 3 textures</button><button data-act="more" title="Three more, different from yours">More</button></div>
      <div class="grid" data-out="custom" style="margin-top:8px"></div>
    </section>
  </div>
  <div class="status" data-out="status"></div>
  <div data-out="applied"></div>
  <div class="foot">
    <button data-act="clear" title="Take the texture off">As designed</button>
    <button class="primary" data-act="save" title="Claude writes this finish into the tokens and the component styles (on the project's branch)">Put it in the app</button>
  </div>
</div>`;

const DEFAULT_CATS = Object.fromEntries(CATS.map((c) => [c.id, c.on])) as Record<Cat, boolean>;

let mounted = false;

export function mountTextureLab(options: TextureOptions): PanelControl | null {
  if (mounted || document.getElementById("texture-lab")) return null;
  mounted = true;
  const { site, endpoint, storagePrefix } = options;
  const stateKey = `${storagePrefix}:texture:state`;
  const customKey = `${storagePrefix}:texture:custom`;
  const openKey = `${storagePrefix}:texture:open`;
  const picsKey = `${storagePrefix}:texture:pics`;
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
      /* still works, just won't remember */
    }
  };

  const host = document.createElement("div");
  host.id = "texture-lab";
  host.setAttribute("data-review-tool", "");
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>${HTML}`;
  const $ = <T extends HTMLElement>(q: string) => root.querySelector(q) as T;
  const out = (name: string) => $(`[data-out="${name}"]`);
  const pill = $(".pill");
  const panel = $(".panel");
  const askBox = $<HTMLTextAreaElement>("[data-in=ask]");
  const strengthIn = $<HTMLInputElement>("[data-in=strength]");
  const writer = new CodeWriter(endpoint, storagePrefix, "texture");
  const protectWords = options.rules?.protectWords ?? [];

  const saved = load<Partial<State>>(stateKey, {});
  let state: State = {
    on: saved.on ?? null,
    strength: saved.strength ?? 1,
    cats: { ...DEFAULT_CATS, ...(saved.cats ?? {}) },
    excluded: saved.excluded ?? [],
  };
  let custom: Texture[] = load<Texture[]>(customKey, []);
  /** Pictures of the look the designer wants (kept by the helper; thumbs here). */
  let pics: { id: string; thumb: string }[] = load(picsKey, []);
  let picsLoading = 0;
  let found: Found[] = [];
  let shared = 0;
  let preview: string | null = null;
  let original = false;
  let busy = false;

  const all = () => [...custom, ...PRESETS];
  const byId = (id: string | null) => (id ? all().find((t) => t.id === id) ?? null : null);

  // ---- history (⌘Z / ⌘⇧Z from the dock)
  let past: string[] = [];
  let future: string[] = [];
  const snapshot = () => JSON.stringify(state);
  const commit = () => {
    const snap = snapshot();
    if (past[past.length - 1] !== snap) {
      past.push(snap);
      if (past.length > 80) past.shift();
      future = [];
    }
    store(stateKey, state);
  };
  const restore = (snap: string) => {
    state = JSON.parse(snap) as State;
    store(stateKey, state);
    apply();
    render();
  };
  window.addEventListener("review-tool:history", (e) => {
    const { target, redo } = (e as CustomEvent<{ target: string; redo: boolean }>).detail;
    if (target !== host.id) return;
    if (redo) {
      const next = future.pop();
      if (next) {
        past.push(next);
        restore(next);
      }
    } else if (past.length > 1) {
      future.push(past.pop()!);
      restore(past[past.length - 1]);
    }
  });

  const say = (text: string, err = false) => {
    const el = out("status");
    el.textContent = text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
    el.title = text.length > 220 ? text : "";
    el.classList.toggle("err", err);
  };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  // ---- reading the app

  function rescan() {
    const got = scan(protectWords, [SHEET_ID, "design-variants"]);
    found = got.found;
    shared = got.shared;
  }

  // ---- the live sheet

  const sheet = () => {
    let el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = SHEET_ID;
    }
    // Last in <head>, so in each shared cascade layer the override follows the rule it replaces.
    if (el.parentNode !== document.head || el !== document.head.lastElementChild) document.head.appendChild(el);
    return el;
  };
  const input = (t: Texture, s = state.strength) => ({ texture: t, found, cats: state.cats, excluded: new Set(state.excluded), strength: s, inks: site.inks });

  function apply() {
    const t = byId(preview ?? state.on);
    const css = t && !original ? buildCss(input(t)) : "";
    const el = sheet();
    if (el.textContent !== css) {
      el.textContent = css;
      window.dispatchEvent(new Event("palettechange"));
    }
    $<HTMLButtonElement>("[data-act=original]").classList.toggle("on", original);
    watchHead(!!css);
  }

  // The app's dev server adds its stylesheets as it loads (and again on each code change): keep ours last.
  let headWatch: MutationObserver | null = null;
  function watchHead(on: boolean) {
    if (on && !headWatch) {
      headWatch = new MutationObserver(() => {
        const el = document.getElementById(SHEET_ID);
        if (el && el !== document.head.lastElementChild) document.head.appendChild(el);
      });
      headWatch.observe(document.head, { childList: true });
    } else if (!on && headWatch) {
      headWatch.disconnect();
      headWatch = null;
    }
  }

  // ---- where a kind is on screen

  const outlineHost = out("outlines");
  const strip = (sel: string) => sel.replace(/::?(before|after|placeholder|selection|marker|backdrop|-webkit-[\w-]+)\b/g, "").replace(/:(hover|active|focus(-visible|-within)?|checked|disabled)\b/g, "");
  function outline(list: Found[]) {
    outlineHost.innerHTML = "";
    const seen = new Set<Element>();
    for (const f of list) {
      let els: Element[] = [];
      try {
        els = [...document.querySelectorAll(strip(f.selector) || "x-none")];
      } catch {
        continue;
      }
      for (const el of els) {
        if (seen.size >= 120) break;
        if (seen.has(el) || el.closest("[data-review-tool]")) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        seen.add(el);
        const box = document.createElement("div");
        box.className = "outline";
        Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        outlineHost.appendChild(box);
      }
    }
    return seen.size;
  }

  // ---- swatches

  function swatchStyle(t: Texture | null): string {
    const s = state.strength;
    const inks = site.inks;
    const r = (role: keyof typeof ROLES) => (t?.tokens[role] ? resolve(t.tokens[role]!, s, inks) : `var(${ROLES[role]})`);
    const ov = t?.overlay.trim() ? resolve(t.overlay, s, inks) : "none";
    const sizes = t?.overlay.trim() ? splitTop(resolve(t.overlay, s, inks)).map((_, i) => splitTop(t.overlaySize)[i] || "auto").join(", ") : "auto";
    const dome = "radial-gradient(circle at 35% 25%, var(--surface-raised-hi, #2a2621) 0%, var(--surface-raised, #1e1b17) 65%, var(--surface-base, #14110e) 100%)";
    const hot = "radial-gradient(circle at 32% 22%, var(--highlight-38, rgba(255,255,255,.3)) 0%, transparent 42%)";
    let key: string;
    if (!t) key = `${hot}, ${dome}`;
    else {
      const layers: string[] = [];
      if (ov !== "none") layers.push(ov);
      if (t.sheen === "keep") layers.push(hot);
      if (t.sheen === "satin") layers.push(resolve("linear-gradient(180deg, L(8) 0%, L(2) 38%, transparent 62%)", s, inks));
      if (t.body === "keep") layers.push(dome);
      if (t.body === "soft") layers.push(`linear-gradient(180deg, color-mix(in oklab, var(--surface-raised), var(${inks.light}) ${4 * s}%) 0%, var(--surface-raised) 45%, color-mix(in oklab, var(--surface-raised), var(${inks.dark}) ${10 * s}%) 100%)`);
      layers.push("var(--surface-raised, #1e1b17)");
      key = layers.join(", ");
    }
    const sheen = t ? (t.sheen === "keep" ? "radial-gradient(circle at 25% 15%, var(--glass-sheen-light), transparent 45%)" : t.sheen === "satin" ? resolve("linear-gradient(180deg, L(6), transparent 60%)", s, inks) : "none") : "radial-gradient(circle at 25% 15%, var(--glass-sheen-light), transparent 45%)";
    const v = (x: string) => x.replace(/"/g, "&quot;");
    return `--r:${v(r("raised"))};--p:${v(r("pressed"))};--f:${v(r("flush"))};--ov:${v(ov)};--ovs:${v(sizes)};--key:${v(key)};--sheen:${v(sheen)}`;
  }

  const card = (t: Texture | null) => {
    const id = t?.id ?? "";
    const isOn = (state.on ?? "") === id;
    return `<div class="tex${isOn ? " on" : ""}" data-tex="${esc(id)}" role="button" tabindex="0" title="${esc(t?.why ?? "The textures as designed today")}">
      <div class="sw" style="${swatchStyle(t)}"><i class="key"></i><i class="well"></i></div>
      <div class="name">${esc(t?.name ?? "As designed")}${isOn ? "<em>On</em>" : ""}</div>
      <p>${esc(t?.why ?? "Today's finish: glossy domes, hot spots and neumorphic shadows.")}</p>
      ${t?.custom ? `<button class="x" data-act="drop" data-id="${esc(id)}" title="Remove">×</button>` : ""}
    </div>`;
  };

  // ---- render

  function render() {
    const counts = (c: Cat) => (c === "shared" ? shared : found.filter((f) => f.cats.includes(c)).length);
    out("found-count").textContent = `${found.length} rules`;
    out("cats").innerHTML = CATS.map((c) => {
      const list = found.filter((f) => f.cats.includes(c.id));
      const rules = c.id === "shared" ? "" : list.length
        ? `<details class="rules"><summary>Where</summary><ul>${list
            .slice(0, 80)
            .map((f) => `<li class="${state.excluded.includes(f.key) ? "off" : ""}" data-key="${esc(f.key)}"><span>${esc(f.selector)}</span><em>${esc(f.file.split("/").pop() ?? "")}</em><button data-act="exclude" data-key="${esc(f.key)}" title="${state.excluded.includes(f.key) ? "Retexture this one again" : "Leave this one as it is"}">${state.excluded.includes(f.key) ? "↺" : "×"}</button></li>`)
            .join("")}</ul></details>`
        : "";
      return `<label class="cat" data-cat="${c.id}" title="${esc(c.hint)}"><input type="checkbox" data-cat-box="${c.id}" ${state.cats[c.id] ? "checked" : ""}><b>${esc(c.label)}</b><small>${counts(c.id)}</small></label>${rules}`;
    }).join("");
    out("presets").innerHTML = card(null) + PRESETS.map(card).join("");
    out("custom").innerHTML = custom.map(card).join("");
    out("on-name").textContent = byId(state.on)?.name ?? "";
    strengthIn.value = String(Math.round(state.strength * 100));
    out("strength").textContent = `${Math.round(state.strength * 100)}%`;
    out("pics").innerHTML =
      pics.map((p) => `<div class="pic" style="background-image:url('${p.thumb}')" title="Claude looks at this when you make textures"><button class="x" data-act="drop-pic" data-pic="${p.id}" title="Remove">×</button></div>`).join("") +
      '<div class="pic wait">adding…</div>'.repeat(picsLoading);
    out("asks").innerHTML = site.asks.map((a) => `<button data-ask="${esc(a)}">${esc(a)}</button>`).join("");
    out("applied").innerHTML = appliedRow(writer.last, esc);
    $<HTMLButtonElement>("[data-act=save]").disabled = !state.on || busy;
  }

  // ---- open / fold

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    pill.hidden = open || options.launcher === false;
    store(openKey, open);
    if (open) {
      rescan();
      render();
      window.dispatchEvent(new CustomEvent("review-tool:open", { detail: "texture-lab" }));
    } else outline([]);
  };
  window.addEventListener("review-tool:open", (e) => {
    if ((e as CustomEvent).detail !== "texture-lab" && !panel.hidden) setOpen(false);
  });

  // ---- choosing

  function choose(id: string | null) {
    state.on = id;
    preview = null;
    commit();
    apply();
    render();
    const t = byId(id);
    if (!t) return say("As designed.");
    const n = found.filter((f) => !state.excluded.includes(f.key) && declsFor(f, input(t), true).length).length;
    say(`${t.name}: ${n} rules retextured${state.cats.shared ? ", plus the shared shadows" : ""}. Hold O for the original.`);
  }

  // ---- make your own (Claude)

  async function make(more: boolean) {
    const ask = askBox.value.trim();
    if (!ask && !pics.length) return say("Describe a texture, paste a picture, or tap a quick pick.", true);
    if (busy) return;
    busy = true;
    const btn = $<HTMLButtonElement>("[data-act=make]");
    btn.disabled = true;
    btn.textContent = "Mixing…";
    say(pics.length ? `Claude is looking at your ${pics.length === 1 ? "picture" : `${pics.length} pictures`} and mixing three textures (about a minute).` : "Claude is mixing three textures (about 30–60 seconds).");
    try {
      const cs = getComputedStyle(document.documentElement);
      const sample = (c: Cat) =>
        found
          .filter((f) => f.cats.includes(c))
          .slice(0, 6)
          .map((f) => `- ${f.selector} (${f.file}): ${c === "bevel" ? f.was.boxShadow : f.was.background}`.slice(0, 400));
      const res = await fetch(`${endpoint}/texture`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ask,
          images: pics.map((p) => p.id),
          roles: Object.fromEntries(Object.entries(ROLES).map(([k, name]) => [k, `${name}: ${cs.getPropertyValue(name).trim().replace(/\s+/g, " ").slice(0, 300)}`])),
          inventory: CATS.map((c) => [`${c.label}: ${c.id === "shared" ? shared : found.filter((f) => f.cats.includes(c.id)).length} rules`, ...(c.id === "shared" ? [] : sample(c.id))].join("\n")).join("\n\n"),
          surfaces: ["--surface-base", "--surface-raised", "--surface-raised-hi", "--surface-recessed"].map((n) => `${n}: ${cs.getPropertyValue(n).trim()}`).join("\n"),
          inks: site.inks,
          avoid: more ? custom.slice(0, 9).map((t) => `${t.name}: ${t.why}`) : [],
        }),
      });
      const data = (await res.json()) as { variants?: Record<string, unknown>[]; error?: string };
      if (!res.ok || !data.variants) throw new Error(data.error ?? `The helper answered ${res.status}.`);
      const pick = <T extends string>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback);
      const made: Texture[] = data.variants.slice(0, 3).map((v, i) => ({
        id: `custom-${Date.now().toString(36)}-${i}`,
        name: cleanValue(v.name, 40) || `Texture ${i + 1}`,
        why: cleanValue(v.why, 220),
        tokens: Object.fromEntries(Object.keys(ROLES).map((k) => [k, cleanValue(v[k])]).filter(([, val]) => val)),
        overlay: String(v.overlay ?? "").replace(/[{};<>]/g, "").replace(/url\s*\(/gi, "").slice(0, 900),
        overlaySize: cleanValue(v.overlaySize, 200),
        body: pick(v.body, ["flat", "soft", "keep"] as const, "flat"),
        sheen: pick(v.sheen, ["remove", "satin", "keep"] as const, "remove"),
        knurl: pick(v.knurl, ["remove", "keep"] as const, "remove"),
        custom: true,
      }));
      custom = [...made, ...custom].slice(0, 18);
      store(customKey, custom);
      choose(made[0]?.id ?? null);
      say(`${made.length} textures under Make your own, showing “${made[0]?.name}”. Hover to compare.`);
    } catch (e) {
      say(`Couldn't make textures: ${(e as Error).message}`, true);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = "◍ Make 3 textures";
      render();
    }
  }

  // ---- put it in the app

  async function save() {
    const t = byId(state.on);
    if (!t) return say("Pick a texture first.", true);
    if (busy) return;
    const x = { ...input(t), strength: state.strength };
    const rules = found
      .filter((f) => !x.excluded.has(f.key))
      .map((f) => ({ f, now: declsFor(f, x, true) }))
      .filter((r) => r.now.length)
      .slice(0, 140)
      .map(({ f, now }) => ({ file: f.file, layer: f.layer, wrap: f.wrap, selector: f.selector, was: f.was, now }));
    const tokens = state.cats.shared ? tokensFor(x) : {};
    const overlay = t.overlay.trim() ? splitTop(resolve(t.overlay, state.strength, site.inks)) : [];
    try {
      const res = await fetch(`${endpoint}/design-save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Texture ${t.name}`,
          texture: true,
          savedAt: new Date().toISOString(),
          url: location.href,
          why: t.why,
          ask: t.custom ? askBox.value.trim() : "",
          recipe: { body: t.body, sheen: t.sheen, knurl: t.knurl, strength: state.strength, replaced: CATS.filter((c) => state.cats[c.id]).map((c) => c.label) },
          tokens,
          overlay: overlay.length ? { "--texture-overlay": overlay.join(", "), "--texture-overlay-size": overlay.map((_, i) => splitTop(t.overlaySize)[i] || "auto").join(", ") } : null,
          rules,
          target: { selector: ":root", scope: "app", count: rules.length, label: `Whole-app texture: ${t.name}`, markup: "" },
          css: buildCss(x),
          locked: [...lockedTokens(options.rules)],
        }),
      });
      const data = (await res.json()) as { name?: string; canApply?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `The helper answered ${res.status}.`);
      if (!data.canApply || !data.name) return say(`Saved “${t.name}”. Ask Claude to write it into the app.`);
      busy = true;
      render();
      const btn = $<HTMLButtonElement>("[data-act=save]");
      btn.textContent = "Writing it in…";
      say(`Claude is writing “${t.name}” into the tokens and ${rules.length} component rules (a few minutes).`);
      try {
        const done = await writer.apply("design", data.name, t.name);
        state.on = null;
        commit();
        apply();
        say(`${done.summary} Reloading.`);
        window.setTimeout(() => location.reload(), 1800);
      } finally {
        busy = false;
        btn.textContent = "Put it in the app";
        render();
      }
    } catch (e) {
      say(`Couldn't put it in the app: ${(e as Error).message}`, true);
    }
  }

  async function undoApply() {
    try {
      say("Taking it back out of the code…");
      const summary = await writer.undo();
      say(`${summary} Reloading.`);
      window.setTimeout(() => location.reload(), 1200);
    } catch (e) {
      say(`Couldn't undo: ${(e as Error).message}`, true);
    }
  }

  // ---- events

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "open") return setOpen(true);
    if (act === "close") return setOpen(false);
    if (act === "scan") {
      rescan();
      apply();
      render();
      return say(`Found ${found.length} textured rules.`);
    }
    if (act === "clear") return choose(null);
    if (act === "make") return void make(false);
    if (act === "more") return void make(true);
    if (act === "save") return void save();
    if (act === "undo-apply") return void undoApply();
    if (act === "add-pic") return $<HTMLInputElement>("[data-in=pic-file]").click();
    if (act === "drop-pic") {
      const id = t.closest<HTMLElement>("[data-pic]")!.dataset.pic!;
      pics = pics.filter((p) => p.id !== id);
      store(picsKey, pics);
      return render();
    }
    if (act === "exclude") {
      e.preventDefault();
      const key = t.closest<HTMLElement>("[data-key]")!.dataset.key!;
      state.excluded = state.excluded.includes(key) ? state.excluded.filter((k) => k !== key) : [...state.excluded, key];
      commit();
      apply();
      return render();
    }
    if (act === "drop") {
      e.stopPropagation();
      const id = t.closest<HTMLElement>("[data-id]")!.dataset.id!;
      custom = custom.filter((c) => c.id !== id);
      store(customKey, custom);
      if (state.on === id) choose(null);
      return render();
    }
    const ask = t.closest<HTMLElement>("[data-ask]")?.dataset.ask;
    if (ask) {
      askBox.value = ask;
      return;
    }
    const tex = t.closest<HTMLElement>("[data-tex]");
    if (tex) choose(tex.dataset.tex || null);
  });
  root.addEventListener("keydown", (e) => {
    const k = e as KeyboardEvent;
    const tex = (k.target as HTMLElement).closest?.("[data-tex]") as HTMLElement | null;
    if (tex && (k.key === "Enter" || k.key === " ")) {
      k.preventDefault();
      choose(tex.dataset.tex || null);
    }
    k.stopPropagation();
  });
  root.addEventListener("change", (e) => {
    const file = (e.target as HTMLElement).closest<HTMLInputElement>("[data-in=pic-file]");
    if (file) {
      void addPics([...(file.files ?? [])]);
      file.value = "";
      return;
    }
    const box = (e.target as HTMLElement).closest<HTMLInputElement>("[data-cat-box]");
    if (!box) return;
    state.cats = { ...state.cats, [box.dataset.catBox as Cat]: box.checked };
    commit();
    apply();
    render();
  });
  // Hover a finish: preview it. Hover a kind: outline where it is.
  root.addEventListener("pointerover", (e) => {
    const t = e.target as HTMLElement;
    const tex = t.closest<HTMLElement>("[data-tex]");
    const id = tex ? tex.dataset.tex || null : undefined;
    if (id !== undefined && id !== preview && !busy) {
      preview = id;
      if (id === null) {
        // "As designed": show it by taking the texture off while hovered.
        const el = sheet();
        el.textContent = "";
      } else apply();
    }
    const cat = t.closest<HTMLElement>("[data-cat]")?.dataset.cat as Cat | undefined;
    const li = t.closest<HTMLElement>("li[data-key]");
    if (li) outline(found.filter((f) => f.key === li.dataset.key));
    else if (cat && cat !== "shared") outline(found.filter((f) => f.cats.includes(cat) && !state.excluded.includes(f.key)));
  });
  root.addEventListener("pointerout", (e) => {
    const t = e.target as HTMLElement;
    const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
    if (t.closest("[data-tex]") && !to?.closest?.("[data-tex]")) {
      preview = null;
      apply();
    }
    if ((t.closest("[data-cat]") || t.closest("li[data-key]")) && !to?.closest?.("[data-cat], li[data-key]")) outline([]);
  });
  strengthIn.addEventListener("input", () => {
    state.strength = Number(strengthIn.value) / 100;
    out("strength").textContent = `${strengthIn.value}%`;
    apply();
  });
  strengthIn.addEventListener("change", () => {
    commit();
    render();
  });

  // Hold Original (or O) to see the textures as designed.
  const hold = (on: boolean) => {
    if (original === on) return;
    original = on;
    apply();
  };
  const origBtn = $<HTMLButtonElement>("[data-act=original]");
  origBtn.addEventListener("pointerdown", () => hold(true));
  origBtn.addEventListener("pointerup", () => hold(false));
  origBtn.addEventListener("pointerleave", () => hold(false));
  const typing = (e: Event) => e.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || (n instanceof HTMLElement && n.isContentEditable));
  document.addEventListener("keydown", (e) => {
    if (panel.hidden || e.code !== "KeyO" || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    hold(true);
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "KeyO") hold(false);
  });

  // ---- pictures: paste anywhere while the lab is open, drop on Make your own, or ＋ Image

  const MAX_PICS = 4;
  const shrink = (file: Blob, edge: number, type: string) =>
    new Promise<string>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL(type, 0.9));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("couldn't read that image"));
      };
      img.src = url;
    });

  async function addPics(files: File[]) {
    const images = files.filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type));
    if (!images.length) return say("Paste or drop a PNG, JPEG, WebP or GIF.", true);
    const room = MAX_PICS - pics.length - picsLoading;
    if (room <= 0) return say(`${MAX_PICS} pictures at most: remove one first.`, true);
    const take = images.slice(0, room);
    picsLoading += take.length;
    render();
    for (const f of take) {
      try {
        // Full detail for Claude (texture lives in the fine grain), small thumb for the panel.
        const [full, thumb] = await Promise.all([shrink(f, 2000, "image/png"), shrink(f, 160, "image/jpeg")]);
        const res = await fetch(`${endpoint}/inspiration`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl: full }) });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) throw new Error(data.error ?? `the helper answered ${res.status}`);
        if (!pics.some((p) => p.id === data.id)) pics.push({ id: data.id, thumb });
      } catch (e) {
        say(`Couldn't add that picture: ${(e as Error).message}. Is the helper running?`, true);
      } finally {
        picsLoading--;
      }
    }
    store(picsKey, pics);
    render();
    if (pics.length) say(`${pics.length === 1 ? "Picture" : `${pics.length} pictures`} ready. Add words if you like, then Make 3 textures.`);
  }

  const clipImages = (dt: DataTransfer | null) => [...(dt?.items ?? [])].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile()).filter((f): f is File => !!f);
  // Window-level so ⌘V works whether the box, the panel or the page has focus — but only while the lab is open
  // and only when the clipboard holds a picture (pasting text into the app is left alone).
  window.addEventListener("paste", (e) => {
    if (panel.hidden) return;
    const files = clipImages(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    void addPics(files);
  }, true);
  const makeBox = $(".make");
  makeBox.addEventListener("dragover", (e) => {
    if (![...(e.dataTransfer?.types ?? [])].includes("Files")) return;
    e.preventDefault();
    makeBox.classList.add("drag");
  });
  makeBox.addEventListener("dragleave", () => makeBox.classList.remove("drag"));
  makeBox.addEventListener("drop", (e) => {
    e.preventDefault();
    makeBox.classList.remove("drag");
    void addPics([...(e.dataTransfer?.files ?? [])]);
  });

  // ---- start

  setOpen(load(openKey, false));
  if (state.on) {
    // A texture left on: read the app now and again once its late stylesheets have arrived.
    rescan();
    apply();
    window.setTimeout(() => {
      rescan();
      apply();
      if (!panel.hidden) render();
    }, 1500);
  }
  past = [snapshot()];
  render();
  const recover = async () => {
    const got = await writer.recover();
    if (got === "waiting") {
      say("Still writing it into the code…");
      window.setTimeout(recover, 3000);
    } else if (got && "failed" in got) say(`Couldn't put it in the app: ${got.failed}`, true);
    else if (got) {
      state.on = null;
      commit();
      apply();
      say(`In the app: ${got.summary}`);
      render();
    }
  };
  void recover();

  return { open: () => setOpen(true), close: () => setOpen(false), isOpen: () => !panel.hidden };
}
