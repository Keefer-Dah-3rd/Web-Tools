/**
 * Type Lab: swap the app's fonts for any Google web font, live, and keep the result as a type style.
 *
 * Each font role the app has (its --font-* tokens: display, interface, text, readouts, LCD) gets a
 * font, a size, a weight and a letter spacing. Hover a font to see it in the app, click to keep it.
 *   font     the role's token points at the new family (loaded from Google Fonts, or the page's own)
 *   size     the family's faces are re-issued under the role's own name with size-adjust, so every
 *            font-size in the app stays as written and the whole role grows or shrinks together
 *   weight   the rules that use the role get their font-weight moved up or down
 *   spacing  …and their letter-spacing opened or tightened
 * Caps spacing scales the app's caps tracking tokens.
 *
 * A set of choices is a type style: save it under a name, switch between styles, or start from a
 * preset. "Put it in the app" writes the style into the code on the project's branch: tokens, the
 * font loading in index.html, and (for weight and spacing) the component rules.
 *
 * Everything is CSS: the app keeps working, and the mascot is never touched.
 */

import { APPLIED_STYLE, CodeWriter, appliedRow } from "../applied";
import type { SiteRules } from "../site-rules";
import type { PanelControl } from "../dock";
import { CATALOGUE, type Face, type FontKind, KINDS, aliasFaces, facesFor, firstFamily, loadSwatch, pageFaces } from "./fonts";

export interface TypeRole {
  /** The custom property, e.g. "--font-display". */
  token: string;
  label: string;
  /** A line in the app's own words, shown in the role's font. */
  sample: string;
  hint: string;
}

export interface RolePick {
  /** null: the family the app has today. */
  family: string | null;
  /** size-adjust, percent. */
  size: number;
  /** font-weight shift, in hundreds' steps (-300 … 300). */
  weight: number;
  /** letter-spacing shift, em. */
  spacing: number;
}

export interface TypeStyle {
  id: string;
  name: string;
  why?: string;
  roles: Record<string, Partial<RolePick>>;
  /** Caps tracking multiplier (1 = as designed). */
  tracking?: number;
  custom?: boolean;
}

export interface TypeSite {
  roles: TypeRole[];
  /** Letter-spacing tokens for tracked caps labels, scaled by Caps spacing. */
  tracking: string[];
  /** The app's name, for the font names written into its code ("Mibbit Display"). */
  appName: string;
  presets: TypeStyle[];
}

export interface TypeOptions {
  launcher?: boolean;
  rules?: SiteRules;
  site: TypeSite;
  endpoint: string;
  storagePrefix: string;
}

interface State {
  roles: Record<string, RolePick>;
  tracking: number;
  styleId: string | null;
}

/** One rule in the app that sets a role's font, with what it says about weight and spacing. */
interface RoleRule {
  key: string;
  token: string;
  selector: string;
  /** Enclosing @layer / @media / @supports preludes, outermost first. */
  wraps: string[];
  layer: string | null;
  file: string;
  weight: string;
  spacing: string;
}

const ACCENT = "#f2b84b";
const SHEET_ID = "type-lab-sheet";
const BLANK: RolePick = { family: null, size: 100, weight: 0, spacing: 0 };
const live = (label: string) => `Type Lab ${label}`;

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.pill { position: fixed; left: 18px; bottom: 190px; z-index: 2147483500; display: flex; align-items: center; gap: 8px; padding: 8px 14px 8px 10px; border-radius: 999px; cursor: pointer;
  background: rgba(22, 25, 31, 0.94); color: #f3f6fa; font: 700 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); }
.pill b { color: ${ACCENT}; font-size: 13px; }
.panel { position: fixed; left: 18px; top: 84px; width: 360px; max-height: calc(100vh - 110px); z-index: 2147483600; display: flex; flex-direction: column;
  color: #e9edf3; font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  background: rgba(22, 25, 31, 0.95); -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.4); }
:host([data-docked]) .panel { left: 8px; top: 36px; max-height: calc(100vh - 84px); }
.head { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; user-select: none; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.head b { flex: 1; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
.head .dot { color: ${ACCENT}; font-size: 13px; font-weight: 800; }
.body { overflow-y: auto; padding: 10px 12px 6px; display: grid; gap: 14px; }
h4 { margin: 0 0 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa6b6; display: flex; align-items: baseline; gap: 8px; }
h4 span { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 600; color: #c8d2df; }
button { font: inherit; color: inherit; cursor: pointer; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.07); padding: 6px 9px; font-weight: 600; }
button:hover { background: rgba(255, 255, 255, 0.13); }
button.on, button.primary { background: ${ACCENT}; color: #2a1c02; border-color: ${ACCENT}; }
button.primary:hover { filter: brightness(1.08); }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible, input:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.note { color: #8e9aab; font-size: 11px; margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chips button { padding: 4px 9px; font-size: 11px; border-radius: 999px; position: relative; }
.chips button .x { margin-left: 4px; color: #8e9aab; }
.chips button .x:hover { color: #ff9a8a; }
input[type=text] { font: inherit; color: #f3f6fa; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 6px 8px; width: 100%; min-width: 0; }
.roles { display: grid; gap: 8px; }
.role { border-radius: 10px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); padding: 8px; display: grid; gap: 6px; }
.role.changed { border-color: color-mix(in srgb, ${ACCENT} 55%, transparent); }
.rhead { display: flex; align-items: center; gap: 8px; }
.rhead b { font-weight: 700; color: #f3f6fa; }
.rhead small { color: #8e9aab; font-weight: 600; font-variant-numeric: tabular-nums; cursor: help; }
.rhead button { margin-left: auto; padding: 1px 7px; font-size: 11px; }
.spec { font-size: 19px; line-height: 1.25; color: #f6f1e7; padding: 8px 10px; border-radius: 7px; background: #14110e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pick { display: flex; width: 100%; justify-content: space-between; align-items: center; text-align: left; }
.pick em { font-style: normal; color: #8e9aab; font-weight: 500; font-size: 10.5px; margin-left: 6px; }
.sl { display: grid; grid-template-columns: 54px 1fr 50px; gap: 8px; align-items: center; font-size: 11px; color: #9aa6b6; }
.sl input { accent-color: ${ACCENT}; width: 100%; margin: 0; }
.sl input:disabled { opacity: .35; }
.sl output { font-variant-numeric: tabular-nums; color: #c8d2df; font-weight: 700; text-align: right; }
.picker { display: grid; gap: 6px; padding: 6px; border-radius: 8px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.12); }
.kinds { display: flex; flex-wrap: wrap; gap: 4px; }
.kinds button { padding: 2px 8px; font-size: 10.5px; border-radius: 999px; }
.fonts { max-height: 260px; overflow-y: auto; display: grid; gap: 1px; }
.font { all: unset; cursor: pointer; display: flex; align-items: baseline; gap: 8px; padding: 5px 8px; border-radius: 6px; color: #f3f6fa; font-size: 16px; line-height: 1.2; }
.font:hover, .font:focus-visible { background: rgba(255,255,255,.08); }
.font.on { background: color-mix(in srgb, ${ACCENT} 18%, transparent); }
.font small { margin-left: auto; font: 600 9.5px/1 -apple-system, sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #7e8a9a; }
.head, .status, .foot, .applied { flex: none; }
.status { min-height: 16px; color: #ffe2a8; font-size: 11px; padding: 0 12px 8px; }
.status.err { color: #ff9a8a; }
.foot { display: flex; gap: 6px; padding: 10px 12px 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.foot .primary { flex: 1; }
.outline { position: fixed; pointer-events: none; z-index: 2147483400; border-radius: 3px; outline: 2px solid ${ACCENT}; outline-offset: 1px; background: color-mix(in srgb, ${ACCENT} 10%, transparent); }
${APPLIED_STYLE}
`;

const HTML = `
<div data-out="outlines"></div>
<button class="pill" data-act="open" title="Type Lab"><b>Aa</b>Type</button>
<div class="panel" hidden>
  <div class="head"><span class="dot">Aa</span><b>Type Lab</b>
    <button data-act="original" title="Hold to see the type as designed (or hold O)">Original</button>
    <button data-act="close" title="Fold">–</button>
  </div>
  <div class="body">
    <section>
      <h4>Type styles <span data-out="style-name"></span></h4>
      <div class="chips" data-out="styles"></div>
      <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input type="text" data-in="style-name" placeholder="Name this style"><button data-act="save-style" title="Keep these fonts as a type style you can come back to">Save style</button></div>
    </section>
    <section>
      <h4>Fonts in the app</h4>
      <div class="roles" data-out="roles"></div>
      <p class="note" style="margin-top:6px">Hover a role's rule count to see where it is. Hover a font to try it, click to keep it.</p>
    </section>
    <section>
      <h4>Caps spacing</h4>
      <div class="sl"><span>Tracking</span><input type="range" min="0" max="200" step="5" data-in="tracking"><output data-out="tracking"></output></div>
    </section>
  </div>
  <div class="status" data-out="status"></div>
  <div data-out="applied"></div>
  <div class="foot">
    <button data-act="clear" title="Every role back to the fonts the app has">As designed</button>
    <button class="primary" data-act="save" title="Write this type style into the app's code (on the project's branch)">Put it in the app</button>
  </div>
</div>`;

let mounted = false;

export function mountTypeLab(options: TypeOptions): PanelControl | null {
  if (mounted || document.getElementById("type-lab")) return null;
  mounted = true;
  const { site, endpoint, storagePrefix } = options;
  const stateKey = `${storagePrefix}:type:state`;
  const stylesKey = `${storagePrefix}:type:styles`;
  const openKey = `${storagePrefix}:type:open`;
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

  // What the app says today, read before this lab's sheet exists.
  const cs = getComputedStyle(document.documentElement);
  const orig: Record<string, string> = Object.fromEntries([...site.roles.map((r) => r.token), ...site.tracking].map((t) => [t, cs.getPropertyValue(t).trim()]));

  const host = document.createElement("div");
  host.id = "type-lab";
  host.setAttribute("data-review-tool", "");
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>${HTML}`;
  const $ = <T extends HTMLElement>(q: string) => root.querySelector(q) as T;
  const out = (name: string) => $(`[data-out="${name}"]`);
  const pill = $(".pill");
  const panel = $(".panel");
  const trackingIn = $<HTMLInputElement>("[data-in=tracking]");
  const nameIn = $<HTMLInputElement>("[data-in=style-name]");
  const writer = new CodeWriter(endpoint, storagePrefix, "type");
  const protectWords = options.rules?.protectWords ?? [];

  const blankRoles = () => Object.fromEntries(site.roles.map((r) => [r.token, { ...BLANK }])) as Record<string, RolePick>;
  const fromStyle = (s: TypeStyle): State => ({
    roles: Object.fromEntries(site.roles.map((r) => [r.token, { ...BLANK, ...(s.roles[r.token] ?? {}) }])),
    tracking: s.tracking ?? 1,
    styleId: s.id,
  });
  const saved = load<Partial<State>>(stateKey, {});
  let state: State = { roles: { ...blankRoles(), ...(saved.roles ?? {}) }, tracking: saved.tracking ?? 1, styleId: saved.styleId ?? null };
  let styles: TypeStyle[] = load<TypeStyle[]>(stylesKey, []);
  let rules: RoleRule[] = [];
  /** A font hovered in the picker: shown in its role until the pointer leaves. */
  let preview: { token: string; family: string | null } | null = null;
  let original = false;
  let busy = false;
  let picking: string | null = null;
  let kind: FontKind | "all" = "all";
  let query = "";

  const allStyles = () => [...styles, ...site.presets];
  const roleOf = (token: string) => site.roles.find((r) => r.token === token)!;
  const changed = (p: RolePick) => p.family !== null || Math.round(p.size) !== 100 || p.weight !== 0 || Math.abs(p.spacing) > 1e-4;
  const anyChange = () => site.roles.some((r) => changed(state.roles[r.token])) || Math.abs(state.tracking - 1) > 1e-3;

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

  // ---- reading the app: which rules use each role

  function scan() {
    const found: RoleRule[] = [];
    const tokens = new Set(site.roles.map((r) => r.token));
    const skipLayers = new Set(["utilities", ...(options.rules?.foreignTokenLayers ?? [])]);
    const walk = (list: CSSRuleList, wraps: string[], layer: string | null, file: string) => {
      for (const rule of list) {
        if (rule instanceof CSSStyleRule) {
          const m = rule.style.cssText.match(/(?:^|;)\s*font(?:-family)?\s*:[^;]*var\(\s*(--font-[\w-]+)/);
          if (!m || !tokens.has(m[1]) || protectWords.some((w) => rule.selectorText.includes(w))) continue;
          found.push({
            key: `${file}|${wraps.join("|")}|${rule.selectorText}`,
            token: m[1],
            selector: rule.selectorText,
            wraps,
            layer,
            file,
            weight: rule.style.getPropertyValue("font-weight").trim(),
            spacing: rule.style.getPropertyValue("letter-spacing").trim(),
          });
        } else if (rule instanceof CSSLayerBlockRule) {
          // Framework layers (Tailwind's generated utilities, its theme) aren't hand-written CSS.
          if (skipLayers.has(rule.name)) continue;
          const name = layer && rule.name ? `${layer}.${rule.name}` : rule.name || layer;
          walk(rule.cssRules, [...wraps, `@layer ${rule.name}`], name, file);
        } else if (rule instanceof CSSImportRule) {
          try {
            if (rule.styleSheet) walk(rule.styleSheet.cssRules, wraps, layer, rule.styleSheet.href ?? file);
          } catch {
            /* another origin */
          }
        } else if ("cssRules" in rule) {
          const text = rule.cssText;
          walk((rule as CSSGroupingRule).cssRules, [...wraps, text.slice(0, text.indexOf("{")).trim()], layer, file);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      const owner = sheet.ownerNode as Element | null;
      if (owner?.closest?.("[data-review-tool]") || owner?.id === SHEET_ID || owner?.id === "design-variants" || owner?.id === "texture-lab-sheet") continue;
      try {
        // The dev server names each sheet by its path on the machine it runs on: keep it from web/ on.
        const id = owner?.getAttribute?.("data-vite-dev-id") ?? sheet.href ?? "inline";
        walk(sheet.cssRules, [], null, id.replace(/^.*?\/(web\/)/, "$1"));
      } catch {
        /* another origin's sheet */
      }
    }
    rules = found;
  }

  // ---- fonts: load what's picked, re-issue it under the role's live name

  const loaded = new Map<string, { faces: Face[]; from: "page" | "google" } | Error | "loading">();
  const familyOf = (token: string, p: RolePick) => p.family ?? firstFamily(orig[token] ?? "");
  function ensure(family: string, pageOnly: boolean) {
    const key = `${pageOnly ? "page:" : ""}${family.toLowerCase()}`;
    const got = loaded.get(key);
    if (got) return got;
    if (pageOnly) {
      const faces = pageFaces(family);
      const v = faces.length ? { faces, from: "page" as const } : new Error("not loaded by the app");
      loaded.set(key, v);
      return v;
    }
    loaded.set(key, "loading");
    facesFor(family)
      .then((v) => loaded.set(key, v))
      .catch((e: Error) => {
        loaded.set(key, e);
        // A font that won't load doesn't stay picked.
        const stuck = site.roles.filter((r) => state.roles[r.token].family?.toLowerCase() === family.toLowerCase());
        if (stuck.length) {
          for (const r of stuck) setRole(r.token, { family: null });
          commit();
          say(e.message, true);
        }
      })
      .finally(() => {
        apply();
        if (!panel.hidden) render();
      });
    return "loading" as const;
  }

  /** The CSS for a set of picks: @font-face aliases, the token overrides, the rule overrides. */
  function cssFor(picks: Record<string, RolePick>, tracking: number): string {
    const faces: string[] = [];
    const vars: string[] = [];
    for (const r of site.roles) {
      const p = picks[r.token];
      if (!p || (p.family === null && Math.round(p.size) === 100)) continue;
      const got = ensure(familyOf(r.token, p), p.family === null);
      if (got === "loading" || got instanceof Error) continue;
      faces.push(aliasFaces(live(r.label), got.faces, p.size));
      vars.push(`${r.token}: "${live(r.label)}", ${orig[r.token]};`);
    }
    if (Math.abs(tracking - 1) > 1e-3)
      for (const t of site.tracking) {
        const m = orig[t]?.match(/^(-?[\d.]+)([a-z%]*)$/);
        if (m) vars.push(`${t}: ${+(Number(m[1]) * tracking).toFixed(4)}${m[2]};`);
      }
    const nudges = rules
      .map((rule) => {
        const decls = ruleDecls(rule, picks[rule.token]);
        if (!decls) return "";
        return rule.wraps.reduceRight((inner, w) => `${w} { ${inner} }`, `${rule.selector} { ${decls} }`);
      })
      .filter(Boolean);
    return [...faces, vars.length ? `:root { ${vars.join(" ")} }` : "", ...nudges].filter(Boolean).join("\n");
  }

  const WEIGHT_WORDS: Record<string, number> = { normal: 400, bold: 700, lighter: 300, bolder: 700 };
  const weightOf = (w: string) => (/^\d+$/.test(w) ? Number(w) : WEIGHT_WORDS[w] ?? null);
  /** What a rule needs for a role's weight and spacing shift ("" when nothing). */
  function ruleDecls(rule: RoleRule, p: RolePick | undefined): string {
    if (!p) return "";
    const out: string[] = [];
    if (p.weight) {
      const own = weightOf(rule.weight);
      // A weight written as var() can't be shifted from here: leave it.
      if (own !== null || !rule.weight) out.push(`font-weight: ${Math.min(900, Math.max(100, (own ?? 400) + p.weight))};`);
    }
    if (Math.abs(p.spacing) > 1e-4) {
      const sp = `${+p.spacing.toFixed(3)}em`;
      const own = rule.spacing && rule.spacing !== "normal" ? rule.spacing : "";
      out.push(`letter-spacing: ${own ? `calc(${own} ${p.spacing < 0 ? "-" : "+"} ${sp.replace("-", "")})` : sp};`);
    }
    return out.join(" ");
  }

  const sheet = () => {
    let el = document.getElementById(SHEET_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = SHEET_ID;
    }
    if (el.parentNode !== document.head || el !== document.head.lastElementChild) document.head.appendChild(el);
    return el;
  };

  const shown = (): Record<string, RolePick> => {
    if (!preview) return state.roles;
    return { ...state.roles, [preview.token]: { ...state.roles[preview.token], family: preview.family } };
  };

  function apply() {
    const css = original ? "" : cssFor(shown(), state.tracking);
    const el = sheet();
    if (el.textContent !== css) {
      el.textContent = css;
      // Canvases that letter with the font tokens redraw on this.
      window.dispatchEvent(new Event("palettechange"));
    }
    $<HTMLButtonElement>("[data-act=original]").classList.toggle("on", original);
    watchHead(!!css);
  }

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

  // ---- where a role is on screen

  const outlineHost = out("outlines");
  const strip = (sel: string) => sel.replace(/::?(before|after|placeholder|selection|marker|backdrop|-webkit-[\w-]+)\b/g, "").replace(/:(hover|active|focus(-visible|-within)?|checked|disabled)\b/g, "");
  function outline(list: RoleRule[]) {
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
        if (seen.size >= 160) break;
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

  // ---- the font picker (one, moved into the role being picked for, so typing keeps focus)

  const picker = document.createElement("div");
  picker.className = "picker";
  picker.innerHTML = `<input type="text" data-in="font-search" placeholder="Search, or type any Google font"><div class="kinds" data-out="kinds"></div><div class="fonts" data-out="fonts"></div>`;
  const searchIn = picker.querySelector<HTMLInputElement>("[data-in=font-search]")!;
  const fontsBox = picker.querySelector<HTMLElement>("[data-out=fonts]")!;
  const swatchWatch = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const fam = (e.target as HTMLElement).dataset.family;
        if (fam) loadSwatch(fam);
        swatchWatch.unobserve(e.target);
      }
    },
    { root: fontsBox },
  );

  function renderPicker() {
    if (!picking) return;
    const current = state.roles[picking].family;
    picker.querySelector<HTMLElement>("[data-out=kinds]")!.innerHTML = KINDS.map((k) => `<button data-kind="${k.id}" class="${kind === k.id && !query.trim() ? "on" : ""}">${k.label}</button>`).join("");
    const q = query.trim().toLowerCase();
    // A search looks through every kind: a font shouldn't hide behind a filter you forgot was on.
    const matches = CATALOGUE.filter((f) => (q ? f.family.toLowerCase().includes(q) : kind === "all" || f.kind === kind));
    const exact = q && CATALOGUE.some((f) => f.family.toLowerCase() === q);
    const asDesigned = firstFamily(orig[picking] ?? "");
    const scrolled = fontsBox.scrollTop;
    fontsBox.innerHTML = [
      `<button class="font${current === null ? " on" : ""}" data-family="" style="font-family:${esc(orig[picking] ?? "")}">${esc(asDesigned)}<small>As designed</small></button>`,
      ...matches.map((f) => `<button class="font${current === f.family ? " on" : ""}" data-family="${esc(f.family)}" style="font-family:'${esc(f.family)}', ${f.kind === "serif" ? "serif" : f.kind === "mono" ? "monospace" : "sans-serif"}">${esc(f.family)}<small>${f.kind}</small></button>`),
      q && !exact && /^[\w][\w \-]{1,60}$/.test(query.trim())
        ? `<button class="font" data-family="${esc(query.trim().replace(/\b\w/g, (c) => c.toUpperCase()))}" data-any="1">Use “${esc(query.trim())}” from Google Fonts<small>any</small></button>`
        : "",
    ].join("");
    fontsBox.scrollTop = scrolled;
    fontsBox.querySelectorAll<HTMLElement>("[data-family]").forEach((el) => el.dataset.family && !el.dataset.any && swatchWatch.observe(el));
  }

  // ---- render

  const pct = (n: number) => `${Math.round(n)}%`;
  const weightLabel = (w: number) => (w === 0 ? "as set" : `${w > 0 ? "+" : "−"}${Math.abs(w)}`);
  const spacingLabel = (s: number) => (Math.abs(s) < 1e-4 ? "as set" : `${s > 0 ? "+" : "−"}${Math.abs(+s.toFixed(3))}em`);

  function render() {
    const refocus = root.activeElement === searchIn;
    const activeStyle = allStyles().find((s) => s.id === state.styleId);
    out("style-name").textContent = activeStyle ? activeStyle.name : anyChange() ? "unsaved" : "";
    out("styles").innerHTML =
      `<button data-style="" class="${!anyChange() ? "on" : ""}" title="The fonts the app has today">As designed</button>` +
      allStyles()
        .map((s) => `<button data-style="${esc(s.id)}" class="${state.styleId === s.id ? "on" : ""}" title="${esc(s.why ?? describe(s))}">${esc(s.name)}${s.custom ? `<span class="x" data-act="drop-style" data-id="${esc(s.id)}" title="Delete this style">×</span>` : ""}</button>`)
        .join("");
    out("roles").innerHTML = site.roles
      .map((r) => {
        const p = state.roles[r.token];
        const fam = familyOf(r.token, p);
        const got = loaded.get(`${p.family === null ? "page:" : ""}${fam.toLowerCase()}`);
        const ownFaces = p.family !== null || pageFaces(fam).length > 0;
        const status = got === "loading" ? "loading…" : got instanceof Error ? got.message : p.family === null && !ownFaces ? "not loaded by the app, shows a fallback" : "";
        const n = rules.filter((x) => x.token === r.token).length;
        const specFamily = p.family === null && Math.round(p.size) === 100 ? orig[r.token] : `"${live(r.label)}", ${orig[r.token]}`;
        return `<div class="role${changed(p) ? " changed" : ""}" data-role="${r.token}">
          <div class="rhead"><b>${esc(r.label)}</b><small data-where="${r.token}" title="${esc(r.hint)}: ${n} rules use ${r.token}">${n} rules</small>${changed(p) ? `<button data-act="reset-role" title="Back to as designed">↺</button>` : ""}</div>
          <div class="spec" style="font-family:${esc(specFamily)};font-weight:${400 + p.weight};letter-spacing:${p.spacing}em">${esc(r.sample)}</div>
          <button class="pick" data-act="pick" title="Choose a font for ${esc(r.label)}"><span>${esc(fam)}${p.family === null ? "<em>as designed</em>" : ""}${status ? `<em>${esc(status)}</em>` : ""}</span><span>${picking === r.token ? "▴" : "▾"}</span></button>
          <div data-slot="picker"></div>
          <label class="sl" title="${ownFaces ? "Scales every size in this role together" : "Pick a font to resize this role (the app doesn't load its font)"}"><span>Size</span><input type="range" min="60" max="150" step="1" data-slider="size" value="${Math.round(p.size)}" ${ownFaces ? "" : "disabled"}><output>${pct(p.size)}</output></label>
          <label class="sl"><span>Weight</span><input type="range" min="-300" max="300" step="100" data-slider="weight" value="${p.weight}"><output>${weightLabel(p.weight)}</output></label>
          <label class="sl"><span>Spacing</span><input type="range" min="-50" max="150" step="5" data-slider="spacing" value="${Math.round(p.spacing * 1000)}"><output>${spacingLabel(p.spacing)}</output></label>
        </div>`;
      })
      .join("");
    if (picking) {
      root.querySelector(`[data-role="${picking}"] [data-slot=picker]`)?.appendChild(picker);
      renderPicker();
      if (refocus) searchIn.focus();
    }
    trackingIn.value = String(Math.round(state.tracking * 100));
    out("tracking").textContent = `${Math.round(state.tracking * 100)}%`;
    out("applied").innerHTML = appliedRow(writer.last, esc);
    $<HTMLButtonElement>("[data-act=save]").disabled = !anyChange() || busy;
  }

  function describe(s: TypeStyle) {
    return site.roles
      .map((r) => (s.roles[r.token]?.family ? `${r.label}: ${s.roles[r.token]!.family}` : ""))
      .filter(Boolean)
      .join(" · ");
  }

  // ---- open / fold

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    pill.hidden = open || options.launcher === false;
    store(openKey, open);
    if (open) {
      scan();
      render();
      window.dispatchEvent(new CustomEvent("review-tool:open", { detail: "type-lab" }));
    } else outline([]);
  };
  window.addEventListener("review-tool:open", (e) => {
    if ((e as CustomEvent).detail !== "type-lab" && !panel.hidden) setOpen(false);
  });

  // ---- choosing

  function setRole(token: string, change: Partial<RolePick>) {
    state.roles = { ...state.roles, [token]: { ...state.roles[token], ...change } };
    state.styleId = null;
  }

  function chooseFont(token: string, family: string | null) {
    preview = null;
    const failed = family ? loaded.get(family.toLowerCase()) : null;
    if (failed instanceof Error) return say(failed.message, true);
    setRole(token, { family });
    commit();
    apply();
    render();
    const r = roleOf(token);
    say(family ? `${r.label} in ${family}. Hold O for the original.` : `${r.label} as designed.`);
  }

  function chooseStyle(id: string) {
    const s = allStyles().find((x) => x.id === id);
    state = s ? fromStyle(s) : { roles: blankRoles(), tracking: 1, styleId: null };
    commit();
    apply();
    render();
    say(s ? `Type style “${s.name}”.` : "As designed.");
  }

  function saveStyle() {
    if (!anyChange()) return say("Change a font first: a style of the fonts as designed is “As designed”.", true);
    const name = nameIn.value.trim().slice(0, 40) || `Style ${styles.length + 1}`;
    const roles = Object.fromEntries(site.roles.filter((r) => changed(state.roles[r.token])).map((r) => [r.token, { ...state.roles[r.token] }]));
    const existing = styles.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const style: TypeStyle = { id: existing?.id ?? `style-${Date.now().toString(36)}`, name, roles, tracking: state.tracking, custom: true };
    styles = existing ? styles.map((s) => (s.id === existing.id ? style : s)) : [style, ...styles].slice(0, 24);
    store(stylesKey, styles);
    state.styleId = style.id;
    commit();
    nameIn.value = "";
    render();
    say(`${existing ? "Updated" : "Saved"} type style “${name}”.`);
  }

  // ---- put it in the app

  /** What a role's token says in the code once the style is in. */
  function inApp(r: TypeRole, p: RolePick) {
    const appAlias = `${site.appName} ${r.label}`;
    if (p.family === null && Math.round(p.size) === 100) return null;
    const fam = familyOf(r.token, p);
    const got = loaded.get(`${p.family === null ? "page:" : ""}${fam.toLowerCase()}`);
    if (!got || got === "loading" || got instanceof Error) throw new Error(`${r.label}'s font (${fam}) hasn't loaded.`);
    const resized = Math.round(p.size) !== 100;
    // Same-origin files go in as paths, so the app's own fonts keep working wherever it's served.
    const faces = resized ? aliasFaces(appAlias, got.faces, p.size).replaceAll(`url("${location.origin}/`, 'url("/') : "";
    // The helper puts `first` in front of the stack the code has then.
    return { first: resized ? appAlias : fam, google: got.from === "google" && !resized ? fam : null, faces };
  }

  async function save() {
    if (!anyChange()) return say("Change a font first.", true);
    if (busy) return;
    const style = allStyles().find((s) => s.id === state.styleId);
    const name = style?.name ?? (nameIn.value.trim() || "Type style");
    let roles;
    try {
      roles = site.roles
        .filter((r) => changed(state.roles[r.token]))
        .map((r) => {
          const p = state.roles[r.token];
          return { token: r.token, label: r.label, family: p.family, size: Math.round(p.size), weight: p.weight, spacing: +p.spacing.toFixed(3), was: orig[r.token], now: inApp(r, p) };
        });
    } catch (e) {
      return say(`${(e as Error).message} Wait a moment and try again.`, true);
    }
    const ruleEdits = rules
      .map((rule) => ({ rule, now: ruleDecls(rule, state.roles[rule.token]) }))
      .filter((x) => x.now)
      .slice(0, 200)
      .map(({ rule, now }) => ({ file: rule.file, wrap: rule.wraps, selector: rule.selector, was: { "font-weight": rule.weight || "(inherited)", "letter-spacing": rule.spacing || "(inherited)" }, now }));
    const tracking =
      Math.abs(state.tracking - 1) > 1e-3
        ? Object.fromEntries(
            site.tracking
              .map((t) => {
                const m = orig[t]?.match(/^(-?[\d.]+)([a-z%]*)$/);
                return m ? [t, `${+(Number(m[1]) * state.tracking).toFixed(3)}${m[2]}`] : null;
              })
              .filter((x): x is [string, string] => !!x),
          )
        : {};
    try {
      const res = await fetch(`${endpoint}/type-save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, savedAt: new Date().toISOString(), url: location.href, roles, tracking, rules: ruleEdits }),
      });
      const data = (await res.json()) as { name?: string; canApply?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `The helper answered ${res.status}.`);
      if (!data.canApply || !data.name) return say(`Saved “${name}”. Ask Claude to write it into the app.`);
      busy = true;
      render();
      const btn = $<HTMLButtonElement>("[data-act=save]");
      btn.textContent = "Writing it in…";
      say(ruleEdits.length ? `Writing “${name}” into the tokens and fonts, and Claude is moving weight and spacing in ${ruleEdits.length} rules (a few minutes).` : `Writing “${name}” into the tokens and fonts.`);
      try {
        const done = await writer.apply("type", data.name, name);
        state = { roles: blankRoles(), tracking: 1, styleId: null };
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

  const roleToken = (el: Element) => el.closest<HTMLElement>("[data-role]")?.dataset.role ?? null;

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "open") return setOpen(true);
    if (act === "close") return setOpen(false);
    if (act === "clear") return chooseStyle("");
    if (act === "save") return void save();
    if (act === "save-style") return saveStyle();
    if (act === "undo-apply") return void undoApply();
    if (act === "drop-style") {
      e.stopPropagation();
      const id = t.closest<HTMLElement>("[data-id]")!.dataset.id!;
      styles = styles.filter((s) => s.id !== id);
      store(stylesKey, styles);
      if (state.styleId === id) state.styleId = null;
      commit();
      return render();
    }
    if (act === "reset-role") {
      const token = roleToken(t)!;
      setRole(token, { ...BLANK });
      commit();
      apply();
      return render();
    }
    if (act === "pick") {
      const token = roleToken(t)!;
      picking = picking === token ? null : token;
      query = "";
      searchIn.value = "";
      if (!picking) picker.remove();
      render();
      if (picking) searchIn.focus();
      return;
    }
    const k = t.closest<HTMLElement>("[data-kind]")?.dataset.kind;
    if (k) {
      kind = k as FontKind | "all";
      query = "";
      searchIn.value = "";
      fontsBox.scrollTop = 0;
      return renderPicker();
    }
    const font = t.closest<HTMLElement>("[data-family]");
    if (font && picking) return chooseFont(picking, font.dataset.family || null);
    const st = t.closest<HTMLElement>("[data-style]");
    if (st) return chooseStyle(st.dataset.style ?? "");
  });
  root.addEventListener("keydown", (e) => {
    const k = e as KeyboardEvent;
    if (k.key === "Enter" && (k.target as HTMLElement).matches?.("[data-in=style-name]")) saveStyle();
    if (k.key === "Enter" && (k.target as HTMLElement).matches?.("[data-in=font-search]") && picking) {
      const first = fontsBox.querySelector<HTMLElement>("[data-family]:not([data-family=''])");
      if (first) chooseFont(picking, first.dataset.family!);
    }
    if (k.key === "Escape" && picking) {
      picking = null;
      picker.remove();
      render();
    }
    k.stopPropagation();
  });
  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t === searchIn) {
      query = t.value;
      fontsBox.scrollTop = 0;
      return renderPicker();
    }
    if (t === trackingIn) {
      state.tracking = Number(t.value) / 100;
      state.styleId = null;
      out("tracking").textContent = `${t.value}%`;
      return apply();
    }
    const slider = t.dataset.slider as "size" | "weight" | "spacing" | undefined;
    const token = roleToken(t);
    if (!slider || !token) return;
    const v = Number(t.value);
    setRole(token, { [slider]: slider === "spacing" ? v / 1000 : v });
    const p = state.roles[token];
    t.nextElementSibling!.textContent = slider === "size" ? pct(p.size) : slider === "weight" ? weightLabel(p.weight) : spacingLabel(p.spacing);
    const spec = root.querySelector<HTMLElement>(`[data-role="${token}"] .spec`);
    if (spec) {
      spec.style.fontWeight = String(400 + p.weight);
      spec.style.letterSpacing = `${p.spacing}em`;
    }
    apply();
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t === trackingIn || t.dataset.slider) {
      commit();
      render();
    }
  });
  // Hover a font: try it in its role. Hover a rule count: outline where the role is.
  root.addEventListener("pointerover", (e) => {
    const t = e.target as HTMLElement;
    const font = t.closest<HTMLElement>("[data-family]");
    if (font && picking && !busy) {
      const family = font.dataset.family || null;
      if (preview?.family !== family || preview.token !== picking) {
        preview = { token: picking, family };
        apply();
      }
    }
    const where = t.closest<HTMLElement>("[data-where]")?.dataset.where;
    if (where) outline(rules.filter((r) => r.token === where));
  });
  root.addEventListener("pointerout", (e) => {
    const t = e.target as HTMLElement;
    const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
    if (t.closest("[data-family]") && !to?.closest?.("[data-family]") && preview) {
      preview = null;
      apply();
    }
    if (t.closest("[data-where]") && !to?.closest?.("[data-where]")) outline([]);
  });

  // Hold Original (or O) to see the type as designed.
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

  // ---- start

  setOpen(load(openKey, false));
  if (anyChange()) {
    // A style left on: read the app now and again once its late stylesheets have arrived.
    scan();
    apply();
    window.setTimeout(() => {
      scan();
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
      state = { roles: blankRoles(), tracking: 1, styleId: null };
      commit();
      apply();
      say(`In the app: ${got.summary}`);
      render();
    }
  };
  void recover();

  return { open: () => setOpen(true), close: () => setOpen(false), isOpen: () => !panel.hidden };
}
