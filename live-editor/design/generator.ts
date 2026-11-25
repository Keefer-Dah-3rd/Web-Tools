/**
 * Design Generator: new designs for one part of the running app, tried in place. Pick a part
 * (a panel, a button row, a tab), say what you want, and Claude writes three variations as CSS
 * scoped to that part, using the app's own tokens. Click through them on the live app, keep the
 * ones worth keeping, and Save hands the chosen one to Claude to write into the component's styles.
 *
 * Variations are CSS only, so the app keeps working while you try them: the markup, the words and
 * the behaviour stay as they are. Parts drawn on a canvas can't be restyled from CSS; the panel
 * says so when you pick one.
 */

import { APPLIED_STYLE, CodeWriter, appliedRow } from "../applied";
import { BOARD_STYLE, ReferenceBoard } from "../references";
import { type SiteRules, isProtected, lockedTokens, withoutForbidden } from "../site-rules";
import type { PanelControl } from "../dock";

export interface DesignSite {
  /** Quick picks for what to change. */
  asks: string[];
  /** Custom properties Claude may use, by prefix (others are left out of the token list). */
  tokenPrefixes: string[];
  /** Custom properties never offered (palette scale steps, say: components use roles). */
  tokenSkip?: RegExp;
}

export interface GeneratorOptions {
  /** Show the panel's own pill. Off when a dock opens it instead. Default on. */
  launcher?: boolean;
  /** What the tools leave alone (protected parts, tokens a framework owns at runtime). */
  rules?: SiteRules;
  site: DesignSite;
  endpoint: string;
  storagePrefix: string;
}

interface Variant {
  name: string;
  why: string;
  css: string;
}

interface Target {
  /** The selector the CSS is scoped to. */
  selector: string;
  /** "all": every element of this kind (by its class); "one": just the picked element. */
  /** "app": the whole app (the selector is :root; variations restyle shared tokens and common parts). */
  scope: "all" | "one" | "app";
  count: number;
  label: string;
  source?: string;
  canvas: boolean;
}

interface Kept extends Variant {
  target: Target;
  ask: string;
}

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.pill { position: fixed; left: 18px; bottom: 108px; z-index: 2147483500; display: flex; align-items: center; gap: 8px; padding: 8px 14px 8px 10px; border-radius: 999px; cursor: pointer;
  background: rgba(22, 25, 31, 0.94); color: #f3f6fa; font: 700 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; letter-spacing: 0.02em;
  border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); }
.pill b { color: #b48cff; font-size: 14px; }
.pill:hover { border-color: #b48cff; }
.panel { position: fixed; left: 18px; top: 84px; width: 340px; max-height: calc(100vh - 110px); z-index: 2147483600; display: flex; flex-direction: column;
  color: #e9edf3; font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  background: rgba(22, 25, 31, 0.95); -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.4); }
/* Docked (a dock opens it): the left-hand slot every tool shares, fixed in place. */
:host([data-docked]) .panel { left: 8px; top: 36px; max-height: calc(100vh - 84px); }
:host([data-docked]) .head { cursor: default; }
.head { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; cursor: grab; user-select: none; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.head b { flex: 1; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
.head .dot { color: #b48cff; font-size: 14px; }
.body { overflow-y: auto; padding: 10px 12px 6px; display: grid; gap: 12px; }
h4 { margin: 0 0 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa6b6; display: flex; align-items: baseline; gap: 8px; }
h4 span { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 600; color: #c8d2df; }
button { font: inherit; color: inherit; cursor: pointer; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.07); padding: 6px 9px; font-weight: 600; }
button:hover { background: rgba(255, 255, 255, 0.13); }
button.on, button.primary { background: #b48cff; color: #12071f; border-color: #b48cff; }
button.primary:hover { background: #c7a8ff; }
button:disabled { opacity: 0.45; cursor: default; }
button:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid #b48cff; outline-offset: 2px; }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.target { padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); display: grid; gap: 4px; }
.target code { font: 600 11px/1.3 ui-monospace, "SF Mono", Menlo, monospace; color: #e2d4ff; word-break: break-all; }
.target small { color: #8e9aab; font-size: 11px; }
.target .warn { color: #ffcf8a; }
textarea, input[type=text] { font: 500 12px/1.35 inherit; font-family: inherit; color: #f3f6fa; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 6px 8px; width: 100%; resize: vertical; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chips button { padding: 4px 8px; font-size: 11px; border-radius: 999px; }
.cards { display: grid; gap: 6px; }
.card { display: grid; gap: 4px; padding: 8px 9px; border-radius: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); cursor: pointer; }
.card:hover { border-color: rgba(180,140,255,.6); }
.card.on { border-color: #b48cff; background: rgba(180,140,255,.12); }
.card .top { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #f3f6fa; }
.card .top span { margin-left: auto; font-weight: 600; font-size: 10.5px; color: #9aa6b6; }
.card p { margin: 0; color: #aab5c3; font-size: 11px; }
.card .x { padding: 0 6px; border: 0; background: none; color: #7e8a9a; }
.card .x:hover { color: #ff9a8a; }
.card details summary { cursor: pointer; color: #8e9aab; font-size: 10.5px; }
.card pre { margin: 4px 0 0; max-height: 160px; overflow: auto; font: 500 10.5px/1.35 ui-monospace, Menlo, monospace; color: #cfd8e3; background: rgba(0,0,0,.3); padding: 6px; border-radius: 6px; white-space: pre-wrap; }
.note { color: #8e9aab; font-size: 11px; margin: 0; }
.drop { border-radius: 10px; transition: background .15s, outline-color .15s; outline: 2px dashed transparent; outline-offset: 4px; }
.drop.over { outline-color: #b48cff; background: rgba(180,140,255,.08); }
${BOARD_STYLE}
label.add { font: inherit; font-weight: 600; cursor: pointer; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.07); padding: 6px 9px; white-space: nowrap; }
label.add:hover { background: rgba(255, 255, 255, 0.13); }
.head, .status, .foot, .applied { flex: none; }
.status { min-height: 16px; color: #d9c7ff; font-size: 11px; padding: 0 12px 8px; }
.status.err { color: #ff9a8a; }
.foot { display: flex; gap: 6px; padding: 10px 12px 8px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.foot .primary { flex: 1; }
.box { position: fixed; pointer-events: none; z-index: 2147483400; border-radius: 4px; display: none; outline: 2px dashed #b48cff; outline-offset: 2px; background: rgba(180,140,255,.08); }
.box.picked { outline-style: solid; background: none; }
${APPLIED_STYLE}
.box .tag { position: absolute; left: -2px; top: -22px; background: #b48cff; color: #12071f; font: 600 11px/18px ui-monospace, "SF Mono", Menlo, monospace; padding: 0 6px; border-radius: 4px; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; }
`;

const HTML = `
<div class="box hover"><span class="tag"></span></div>
<div class="box picked"><span class="tag"></span></div>
<button class="pill" data-act="open" title="Design Generator"><b>✦</b>Design</button>
<div class="panel" hidden>
  <div class="head"><span class="dot">✦</span><b>Design Generator</b>
    <button data-act="original" title="Hold to see it as designed (or hold O)">Original</button>
    <button data-act="close" title="Fold">–</button>
  </div>
  <div class="body">
    <section>
      <h4>The part <span data-out="scope-count"></span></h4>
      <div class="target" data-out="target"></div>
      <div class="row" style="margin-top:6px">
        <button data-act="pick">◎ Pick a part</button>
        <button data-act="whole-app" title="Design the whole app, not one part">▣ Whole app</button>
        <button data-act="parent" title="The part around it (↑ while picking)">↑ Bigger</button>
        <button data-act="child" title="A part inside it (↓ while picking)">↓ Smaller</button>
      </div>
      <div class="row" style="margin-top:6px" data-out="scopes"></div>
    </section>
    <section>
      <h4>What to try</h4>
      <textarea data-in="ask" rows="3" placeholder="e.g. make these feel like physical keys, less glow, more like the OP-1's screen"></textarea>
      <div class="chips" data-out="asks" style="margin-top:6px"></div>
      <div class="row" style="margin-top:8px"><button class="primary" data-act="make">✦ Make 3 variations</button><button data-act="more" title="Three more, different from these">More</button></div>
    </section>
    <section class="drop" data-out="drop">
      <h4>References <span data-out="inspo-count"></span></h4>
      <div class="refs" data-out="refs"></div>
      <div class="row" style="margin-top:6px">
        <label class="add">＋ Images<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden data-in="files"></label>
        <button data-act="mark-app" title="Click-drag over parts of the app you like">⬚ Mark part of the app</button>
      </div>
      <p class="note" style="margin-top:6px">Drop or paste (⌘V) images too. Click a reference to box the parts you like and tick what Claude should learn: colour, type, cards…</p>
    </section>
    <section>
      <h4>Variations <span data-out="showing"></span></h4>
      <div class="cards" data-out="variants"></div>
    </section>
    <section>
      <h4>Kept <span data-out="kept-count"></span></h4>
      <div class="cards" data-out="kept"></div>
    </section>
  </div>
  <div class="status" data-out="status"></div>
  <div data-out="applied"></div>
  <div class="foot">
    <button data-act="clear" title="Take the variation off">As designed</button>
    <button data-act="keep" title="Keep the variation on the page for later">Keep</button>
    <button class="primary" data-act="save" title="Claude writes it into the component's styles (on the project's branch)">Put it in the app</button>
  </div>
</div>`;

const TOOL = "[data-review-tool]";
const STATE_CLASS = /^(is-|has-|active|selected|open|on|off|hover|focus|disabled|playing|dragging|dragover|lit|current)/i;

/** The one property sheet the generator writes into (unlayered, so it beats the app's layered CSS). */
const sheet = () => {
  let el = document.getElementById("design-variants") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "design-variants";
    document.head.appendChild(el);
  }
  return el;
};

/** Only CSS that styles: no imports, no outside URLs, no scripts. */
function cleanCss(css: string): string {
  return css
    .replace(/<\/?style[^>]*>/gi, "")
    .replace(/@import[^;]*;/gi, "")
    .replace(/url\(\s*(['"]?)(?!data:image\/svg\+xml)[^)]*\1\s*\)/gi, "none")
    .replace(/expression\s*\(/gi, "(")
    .replace(/javascript:/gi, "")
    .trim();
}

/** Scope a variation's CSS (written with & for the part) to the part's selector, as nested CSS. */
const scoped = (selector: string, css: string) => `${selector} {\n${cleanCss(css)}\n}`;

let mounted = false;

export function mountDesignGenerator(options: GeneratorOptions): PanelControl | null {
  if (mounted || document.getElementById("design-generator")) return null;
  mounted = true;
  const { site, endpoint, storagePrefix } = options;
  const keptKey = `${storagePrefix}:design:kept`;
  const lastKey = `${storagePrefix}:design:last`;
  const openKey = `${storagePrefix}:design:open`;
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
      /* the generator still works; it just won't remember */
    }
  };

  const host = document.createElement("div");
  host.id = "design-generator";
  host.setAttribute("data-review-tool", "");
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>${HTML}`;
  const $ = <T extends HTMLElement>(q: string) => root.querySelector(q) as T;
  const out = (name: string) => $(`[data-out="${name}"]`);
  const pill = $(".pill");
  const panel = $(".panel");
  const hoverBox = $(".box.hover");
  const pickBox = $(".box.picked");
  const askBox = $<HTMLTextAreaElement>("[data-in=ask]");

  const last = load<{ target?: Target; ask?: string; variants?: Variant[]; on?: number }>(lastKey, {});
  let target: Target | null = last.target ?? null;
  let element: Element | null = target ? document.querySelector(target.selector) : null;
  let variants: Variant[] = last.variants ?? [];
  let on = last.on ?? -1;
  let kept: Kept[] = load<Kept[]>(keptKey, []);
  /** What Claude learns from: images (with boxes and checkboxes) and marked parts of the app. Built below. */
  let board: ReferenceBoard;
  let picking = false;
  let hovered: Element | null = null;
  let original = false;
  let busy = false;
  const writer = new CodeWriter(endpoint, storagePrefix, "design");
  askBox.value = last.ask ?? "";

  // ---- undo / redo: picking a part, its scope, the variations and which one is on
  type Snapshot = { target: Target | null; variants: Variant[]; on: number };
  let past: string[] = [];
  let future: string[] = [];
  const snapshot = () => JSON.stringify({ target, variants, on } satisfies Snapshot);
  const remember = () => {
    store(lastKey, { target, ask: askBox.value, variants, on });
    const snap = snapshot();
    if (snap === past[past.length - 1]) return;
    past.push(snap);
    if (past.length > 60) past.shift();
    future = [];
  };
  const restore = (snap: string) => {
    const s: Snapshot = JSON.parse(snap);
    target = s.target;
    variants = s.variants;
    on = s.on;
    element = !target ? null : target.scope === "app" ? document.documentElement : document.querySelector(target.selector);
    store(lastKey, { target, ask: askBox.value, variants, on });
    applyVariant();
    render();
  };
  const undo = () => {
    if (past.length < 2) return say("Nothing to undo.");
    future.push(past.pop()!);
    restore(past[past.length - 1]);
    say("Undone.");
  };
  const redo = () => {
    const next = future.pop();
    if (!next) return say("Nothing to redo.");
    past.push(next);
    restore(next);
    say("Redone.");
  };
  window.addEventListener("review-tool:history", (e) => {
    const { target: who, redo: again } = (e as CustomEvent<{ target: string; redo: boolean }>).detail;
    if (who === host.id) (again ? redo : undo)();
  });
  const say = (text: string, err = false) => {
    const el = out("status");
    // Long answers (Claude's summaries) stay short here; the whole text is on hover.
    el.textContent = text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
    el.title = text.length > 220 ? text : "";
    el.classList.toggle("err", err);
  };
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    pill.hidden = open || options.launcher === false;
    store(openKey, open);
    followWhileOpen(open);
    follow();
    if (open) window.dispatchEvent(new CustomEvent("review-tool:open", { detail: "design-generator" }));
    if (!open) stopPicking();
  };
  // Another left-side tool opened: fold out of its way.
  window.addEventListener("review-tool:open", (e) => {
    if ((e as CustomEvent).detail !== "design-generator" && !panel.hidden) setOpen(false);
  });

  // ---- naming a part

  const ours = (node: EventTarget | null) => node instanceof Node && (node === host || host.contains(node) || (node instanceof Element && !!node.closest(TOOL)));
  const hit = (event: Event): Element | null => {
    const path = event.composedPath();
    if (path.some((n) => n instanceof Element && n.matches?.(TOOL))) return null;
    const node = path[0];
    return node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  };

  /** The class that names this kind of part (skipping state classes like is-active). */
  const kindClass = (el: Element) => [...el.classList].find((c) => !STATE_CLASS.test(c) && !/^[a-z]{1,2}-\d/.test(c) && !c.includes(":"));

  const pathSelector = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const parent: Element | null = node.parentElement;
      if (!parent) break;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${[...parent.children].indexOf(node) + 1})`);
      node = parent;
    }
    // Anchored to body, or the same shape would match anywhere below.
    if (node === document.body) parts.unshift("body");
    return parts.join(" > ");
  };

  /** Which React components the element sits in (React 19 dev keeps them on the fiber). */
  const componentsOf = (el: Element): string | undefined => {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    let fiber = key ? (el as unknown as Record<string, { type?: unknown; return?: unknown }>)[key] : undefined;
    const names: string[] = [];
    for (let i = 0; fiber && i < 16 && names.length < 3; i++) {
      const t = fiber.type as { displayName?: string; name?: string } | string | undefined;
      const name = t && typeof t !== "string" ? t.displayName || t.name : undefined;
      if (name && /^[A-Z]/.test(name)) names.push(name);
      fiber = fiber.return as typeof fiber;
    }
    return names.length ? `in ${names.join(" < ")}` : undefined;
  };

  const targetFor = (el: Element, scope: "all" | "one"): Target => {
    const cls = kindClass(el);
    const all = cls ? `.${CSS.escape(cls)}` : null;
    const selector = scope === "all" && all ? all : pathSelector(el);
    const tag = `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`;
    return {
      selector,
      scope: scope === "all" && all ? "all" : "one",
      count: document.querySelectorAll(selector).length,
      label: tag,
      source: componentsOf(el),
      canvas: el instanceof HTMLCanvasElement || !!el.querySelector("canvas"),
    };
  };

  const place = (box: HTMLElement, el: Element | null, label?: string) => {
    if (!el) {
      box.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    (box.firstElementChild as HTMLElement).textContent = label ?? "";
  };

  const WHOLE_APP: Target = { selector: ":root", scope: "app", count: 1, label: "the whole app", canvas: false };
  function chooseWholeApp() {
    stopPicking();
    if (target?.scope !== "app" && variants.length) {
      variants = [];
      on = -1;
    }
    element = document.documentElement;
    target = WHOLE_APP;
    applyVariant();
    remember();
    render();
    say("The whole app. Say what to try: variations restyle the shared tokens and the most-used parts.");
  }

  /** Make a part the one being designed; false when it can't be (the mascot). */
  function choose(el: Element | null): boolean {
    if (!el) return false;
    if (isProtected(options.rules, el)) {
      say("That's the mascot: he keeps his look for now (his own design system comes later), so the tools leave him alone.", true);
      return false;
    }
    const scope = target?.scope === "one" ? "one" : "all";
    if (target && variants.length && el !== element) {
      variants = [];
      on = -1;
    }
    element = el;
    target = targetFor(el, scope);
    applyVariant();
    remember();
    render();
    return true;
  }

  function stopPicking() {
    picking = false;
    hovered = null;
    place(hoverBox, null);
    document.documentElement.style.cursor = "";
    render();
  }

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!picking) return;
      const el = hit(e);
      hovered = el && !ours(el) ? el : null;
      const cls = hovered && kindClass(hovered);
      place(hoverBox, hovered, hovered ? `${hovered.tagName.toLowerCase()}${cls ? `.${cls}` : ""}` : "");
    },
    true,
  );
  const swallow = (e: Event) => {
    if (!picking || !hit(e) || ours(hit(e))) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) document.addEventListener(type, swallow, true);
  document.addEventListener(
    "click",
    (e) => {
      if (!picking) return;
      const el = hit(e);
      if (!el || ours(el)) return;
      swallow(e);
      stopPicking();
      if (choose(el)) say("Picked. Say what to try, then Make 3 variations.");
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      const typing = e.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || (n instanceof HTMLElement && n.isContentEditable));
      if (picking) {
        if (e.key === "Escape") stopPicking();
        else if (e.key === "ArrowUp" && hovered?.parentElement && hovered.parentElement !== document.body) hovered = hovered.parentElement;
        else if (e.key === "ArrowDown" && hovered?.firstElementChild) hovered = hovered.firstElementChild;
        else return;
        e.preventDefault();
        e.stopPropagation();
        place(hoverBox, hovered, hovered ? hovered.tagName.toLowerCase() : "");
        return;
      }
      if (!panel.hidden && !typing && !e.repeat && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "o" && on >= 0) {
        e.preventDefault();
        e.stopPropagation();
        original = true;
        applyVariant();
      }
    },
    true,
  );
  document.addEventListener(
    "keyup",
    (e) => {
      if (original && e.key.toLowerCase() === "o") {
        original = false;
        applyVariant();
      }
    },
    true,
  );
  const follow = () => {
    if (!element?.isConnected && target) element = document.querySelector(target.selector);
    place(pickBox, panel.hidden || picking || target?.scope === "app" ? null : element, target?.label);
  };
  window.addEventListener("scroll", follow, { passive: true, capture: true });
  window.addEventListener("resize", follow);
  // The outline follows the part only while the panel is open (an app can move things without scrolling).
  let following = 0;
  const followWhileOpen = (open: boolean) => {
    window.clearInterval(following);
    if (open) following = window.setInterval(follow, 500);
  };

  // ---- context for Claude

  /** The app's own CSS rules that mention the part's classes (and its children's), as written. */
  function rulesFor(el: Element): string {
    const classes = new Set<string>();
    for (const node of [el, ...el.querySelectorAll("*")].slice(0, 120)) for (const c of node.classList) classes.add(c);
    return rulesForClasses([...classes]);
  }

  /** The most-used kinds of part on screen (by class), each with how many and how the first one looks. */
  function inventory(): { classes: string[]; text: string } {
    const counts = new Map<string, { n: number; first: Element }>();
    for (const el of document.body.querySelectorAll("*")) {
      if (el.closest(TOOL) || isProtected(options.rules, el)) continue;
      const cls = kindClass(el);
      if (!cls || cls.length < 3) continue;
      const c = counts.get(cls);
      if (c) c.n++;
      else counts.set(cls, { n: 1, first: el });
    }
    const top = [...counts.entries()]
      .filter(([, c]) => c.first.getBoundingClientRect().width > 0)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 40);
    const text = top
      .map(([cls, c]) => {
        const words = (c.first.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
        return `- ${c.first.tagName.toLowerCase()}.${cls} ×${c.n}${words ? ` “${words}”` : ""}: ${computedOf(c.first).slice(0, 360)}`;
      })
      .join("\n");
    return { classes: top.map(([cls]) => cls), text };
  }

  function rulesForClasses(classList: string[]): string {
    const wanted = classList.filter((c) => c.length > 2).map((c) => `.${c}`);
    const found: string[] = [];
    let room = 14000;
    const walk = (rules: CSSRuleList, wrap: (css: string) => string) => {
      for (const rule of rules) {
        if (room <= 0) return;
        if (rule instanceof CSSStyleRule) {
          if (wanted.some((w) => rule.selectorText.includes(w))) {
            const text = wrap(rule.cssText);
            found.push(text);
            room -= text.length;
          }
        } else if ("cssRules" in rule) {
          const group = rule as CSSGroupingRule;
          const head = rule instanceof CSSMediaRule ? `@media ${rule.conditionText}` : rule instanceof CSSLayerBlockRule ? `@layer ${rule.name}` : "";
          walk(group.cssRules, (css) => (head && !head.startsWith("@layer") ? wrap(`${head} { ${css} }`) : wrap(css)));
        }
      }
    };
    for (const s of document.styleSheets) {
      if (s.ownerNode instanceof Element && (s.ownerNode.id === "design-variants" || s.ownerNode.id === "colour-lab-vars")) continue;
      try {
        walk(s.cssRules, (css) => css);
      } catch {
        /* a cross-origin sheet: skip */
      }
    }
    return found.join("\n");
  }

  const STYLE_KEYS = ["display", "position", "width", "height", "padding", "margin", "gap", "font-family", "font-size", "font-weight", "letter-spacing", "text-transform", "color", "background-color", "background-image", "border", "border-radius", "box-shadow", "opacity", "grid-template-columns", "flex-direction", "align-items", "justify-content"];
  function computedOf(el: Element): string {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}×${Math.round(r.height)}px; ${STYLE_KEYS.map((k) => `${k}: ${cs.getPropertyValue(k)}`)
      .filter((d) => !/: (none|normal|0px|auto|static)$/.test(d))
      .join("; ")}`;
  }

  /** The part's markup, trimmed: tags, classes and short text, no inline data. */
  function markupOf(el: Element): string {
    const clone = el.cloneNode(true) as Element;
    for (const node of [clone, ...clone.querySelectorAll("*")]) {
      for (const attr of [...node.attributes]) if (!/^(class|role|aria-label|data-[a-z-]+|type|title)$/.test(attr.name) || attr.value.length > 80) node.removeAttribute(attr.name);
      if (node.tagName === "svg") node.innerHTML = "…";
    }
    return clone.outerHTML.replace(/\s+/g, " ").slice(0, 7000);
  }

  function tokensNow(): string {
    const cs = getComputedStyle(document.documentElement);
    const out: string[] = [];
    for (let i = 0; i < cs.length; i++) {
      const name = cs[i];
      if (!name.startsWith("--") || !site.tokenPrefixes.some((p) => name.startsWith(p)) || site.tokenSkip?.test(name)) continue;
      out.push(`${name}: ${cs.getPropertyValue(name).trim().replace(/\s+/g, " ").slice(0, 90)}`);
      if (out.length > 260) break;
    }
    return out.join("\n");
  }

  // ---- variations

  function applyVariant() {
    const v = on >= 0 ? variants[on] : null;
    const next = v && target && !original ? scoped(target.selector, v.css) : "";
    if (sheet().textContent !== next) {
      sheet().textContent = next;
      // A variation may change colour tokens: canvases that resolved theirs once redraw.
      window.dispatchEvent(new Event("palettechange"));
    }
    $<HTMLButtonElement>("[data-act=original]").classList.toggle("on", original);
  }

  async function make(more: boolean) {
    if (!target || !element) return say("Pick a part first.", true);
    const ask = askBox.value.trim();
    if (!ask) return say("Say what to try first, or tap a quick pick.", true);
    if (busy) return;
    busy = true;
    const btn = $<HTMLButtonElement>("[data-act=make]");
    btn.disabled = true;
    btn.textContent = "Designing…";
    say("Claude is sketching three variations (about 30–60 seconds).");
    remember();
    try {
      const res = await fetch(`${endpoint}/design`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ask,
          target: { selector: target.selector, scope: target.scope, count: target.count, label: target.label, source: target.source, canvas: target.canvas },
          ...(target.scope === "app"
            ? (() => {
                const inv = inventory();
                return { inventory: inv.text, computed: computedOf(document.body), rules: rulesForClasses(inv.classes) };
              })()
            : {
                markup: markupOf(element),
                computed: computedOf(element),
                children: [...element.children].slice(0, 6).map((c) => `${c.tagName.toLowerCase()}${kindClass(c) ? `.${kindClass(c)}` : ""}: ${computedOf(c)}`),
                rules: rulesFor(element),
              }),
          tokens: tokensNow(),
          locked: [...lockedTokens(options.rules)],
          protect: options.rules?.protectWords ?? [],
          avoid: more ? variants.map((v) => `${v.name}: ${v.why}`) : [],
          references: await board.payload(),
          viewport: { width: innerWidth, height: innerHeight },
        }),
      });
      const data = (await res.json()) as { variants?: Variant[]; diagnosis?: string; error?: string };
      if (!res.ok || !data.variants) throw new Error(data.error ?? `The helper answered ${res.status}.`);
      // Leave out anything that would reach the mascot or set a token the app can't show.
      const locked = lockedTokens(options.rules);
      const left = new Set<string>();
      variants = data.variants
        .map((v) => {
          const clean = withoutForbidden(v.css ?? "", options.rules, locked);
          clean.dropped.forEach((d) => left.add(d));
          return { ...v, css: clean.css };
        })
        .filter((v) => v.css.trim());
      if (left.size) window.setTimeout(() => say(`Left out of the variations (the mascot, or tokens Tailwind sets): ${[...left].slice(0, 4).join(", ")}${left.size > 4 ? "…" : ""}.`), 50);
      on = variants.length ? 0 : -1;
      applyVariant();
      remember();
      say(`${variants.length} variations, showing the first. Click to switch; hold O for the original.`);
    } catch (e) {
      say(`Couldn't make variations: ${(e as Error).message}`, true);
    } finally {
      busy = false;
      btn.disabled = false;
      btn.textContent = "✦ Make 3 variations";
      render();
    }
  }

  function keep() {
    const v = on >= 0 ? variants[on] : null;
    if (!v || !target) return say("Show a variation first.", true);
    kept = [{ ...v, target, ask: askBox.value.trim() }, ...kept.filter((k) => !(k.name === v.name && k.target.selector === target!.selector))].slice(0, 30);
    store(keptKey, kept);
    render();
    say(`Kept “${v.name}”.`);
  }

  async function save() {
    const v = on >= 0 ? variants[on] : null;
    if (!v || !target || !element) return say("Show a variation first; Save hands that one to Claude.", true);
    try {
      const res = await fetch(`${endpoint}/design-save`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: v.name,
          savedAt: new Date().toISOString(),
          url: location.href,
          note: "A design variation from the Design Generator, tried live. css is nested CSS where & is the part; it was applied as `<target.selector> { css }` on top of the app's styles. Write it into the component's own stylesheet (and only with the app's tokens), replacing what it overrides, not as an extra layer.",
          ask: askBox.value.trim(),
          why: v.why,
          target: { ...target, markup: target.scope === "app" ? "" : markupOf(element) },
          css: cleanCss(v.css),
          references: await board.payload(),
          locked: [...lockedTokens(options.rules)],
        }),
      });
      const data = (await res.json()) as { file?: string; name?: string; canApply?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `The helper answered ${res.status}.`);
      if (!data.canApply || !data.name) return say(`Saved “${v.name}”. Ask Claude to write it into the component.`);
      if (busy) return;
      busy = true;
      const btn = $<HTMLButtonElement>("[data-act=save]");
      btn.disabled = true;
      btn.textContent = "Writing it in…";
      say("Claude is writing it into the component's styles (about a minute or two).");
      try {
        const done = await writer.apply("design", data.name, v.name);
        // The component's own styles now look like this: take the variation off and reload.
        on = -1;
        applyVariant();
        remember();
        say(`${done.summary} Reloading.`);
        window.setTimeout(() => location.reload(), 1800);
      } finally {
        busy = false;
        btn.disabled = false;
        btn.textContent = "Put it in the app";
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

  // ---- render

  function render() {
    const t = out("target");
    if (!target) {
      t.innerHTML = `<small>Nothing picked yet. Press Pick a part, then click anything in the app.</small>`;
    } else {
      t.innerHTML = `<code>${esc(target.label)}</code><small>${esc(target.source ?? "")}</small>${
        target.canvas ? `<small class="warn">Drawn on a canvas: CSS can change its frame, not what's drawn inside.</small>` : ""
      }${element && !element.isConnected ? `<small class="warn">Not on screen right now.</small>` : ""}`;
    }
    const whole = target?.scope === "app";
    if (whole) t.innerHTML = `<code>▣ the whole app</code><small>Variations restyle the shared tokens (corners, shadows, surfaces, type) and the most-used parts, everywhere at once.</small>`;
    $<HTMLButtonElement>("[data-act=whole-app]").classList.toggle("on", whole);
    $<HTMLButtonElement>("[data-act=parent]").disabled = whole || !target;
    $<HTMLButtonElement>("[data-act=child]").disabled = whole || !target;
    out("scope-count").textContent = target && !whole ? `${target.count} on screen` : "";
    const canAll = element ? !!kindClass(element) : false;
    out("scopes").innerHTML = target && !whole
      ? `<button data-scope="all" class="${target.scope === "all" ? "on" : ""}" ${canAll ? "" : "disabled"}>Every one like it</button><button data-scope="one" class="${target.scope === "one" ? "on" : ""}">Just this one</button>`
      : "";
    $<HTMLButtonElement>("[data-act=pick]").classList.toggle("on", picking);
    $<HTMLButtonElement>("[data-act=pick]").textContent = picking ? "Click a part… (Esc)" : "◎ Pick a part";
    out("asks").innerHTML = site.asks.map((a) => `<button data-ask="${esc(a)}">${esc(a)}</button>`).join("");
    out("showing").textContent = variants.length ? (on >= 0 ? `${on + 1} of ${variants.length} on` : "none on") : "";
    out("variants").innerHTML = variants.length
      ? variants
          .map(
            (v, i) => `<div class="card${i === on ? " on" : ""}" data-variant="${i}" role="button" tabindex="0">
              <div class="top">${i + 1}. ${esc(v.name)}</div><p>${esc(v.why)}</p>
              <details><summary>CSS</summary><pre>${esc(cleanCss(v.css))}</pre></details></div>`,
          )
          .join("")
      : `<p class="note">Variations appear here and on the app.</p>`;
    out("kept").innerHTML = kept
      .map(
        (k, i) => `<div class="card" data-kept="${i}" role="button" tabindex="0">
          <div class="top">${esc(k.name)}<span>${esc(k.target.label)}</span><button class="x" data-drop="${i}" title="Forget">✕</button></div><p>${esc(k.why)}</p></div>`,
      )
      .join("");
    out("kept-count").textContent = kept.length ? String(kept.length) : "";
    const refCount = (board as ReferenceBoard | undefined)?.count ?? 0;
    out("inspo-count").textContent = refCount ? `${refCount} of 6` : "";
    out("applied").innerHTML = appliedRow(writer.last, esc);
    follow();
  }

  root.addEventListener("click", (event) => {
    const t = event.target as HTMLElement;
    if (t.closest("details")) return;
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    const scope = t.closest<HTMLElement>("[data-scope]")?.dataset.scope as "all" | "one" | undefined;
    const ask = t.closest<HTMLElement>("[data-ask]")?.dataset.ask;
    const vi = t.closest<HTMLElement>("[data-variant]")?.dataset.variant;
    const drop = t.closest<HTMLElement>("[data-drop]")?.dataset.drop;
    const ki = t.closest<HTMLElement>("[data-kept]")?.dataset.kept;

    if (drop != null) {
      kept.splice(Number(drop), 1);
      store(keptKey, kept);
      render();
    } else if (scope && element) {
      target = targetFor(element, scope);
      applyVariant();
      remember();
      render();
    } else if (ask) {
      askBox.value = askBox.value.trim() ? `${askBox.value.trim()}; ${ask.toLowerCase()}` : ask;
      remember();
    } else if (vi != null) {
      on = Number(vi) === on ? -1 : Number(vi);
      applyVariant();
      remember();
      render();
    } else if (ki != null) {
      const k = kept[Number(ki)];
      target = k.target;
      element = document.querySelector(k.target.selector);
      variants = [k];
      on = 0;
      askBox.value = k.ask;
      applyVariant();
      remember();
      render();
      say(element ? `Showing kept “${k.name}”.` : `Showing kept “${k.name}”; its part isn't on screen right now.`);
    } else if (act === "open") setOpen(true);
    else if (act === "close") setOpen(false);
    else if (act === "pick") {
      picking = !picking;
      if (picking) say("Click any part of the app. ↑ ↓ change the size; Esc stops.");
      else stopPicking();
      render();
    } else if (act === "whole-app") chooseWholeApp();
    else if (act === "mark-app") {
      stopPicking();
      board.markApp();
    }
    else if (act === "parent" && element?.parentElement && element.parentElement !== document.body) choose(element.parentElement);
    else if (act === "child" && element?.firstElementChild) choose(element.firstElementChild);
    else if (act === "make") void make(false);
    else if (act === "more") void make(true);
    else if (act === "clear") {
      on = -1;
      applyVariant();
      remember();
      render();
    } else if (act === "keep") keep();
    else if (act === "save") void save();
    else if (act === "undo-apply") void undoApply();
  });

  // Original: click toggles, or hold.
  const originalBtn = $<HTMLButtonElement>("[data-act=original]");
  originalBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    original = !original;
    applyVariant();
  });

  askBox.addEventListener("input", remember);

  // ---- references: images (file picker, drop, paste) and marked parts of the app

  /** App parts as Claude sees them: what they are, how they look, the CSS that styles them. */
  const describeParts = (els: Element[]) => {
    const kinds = new Map<string, number>();
    for (const el of els) {
      const k = `${el.tagName.toLowerCase()}${kindClass(el) ? `.${kindClass(el)}` : ""}`;
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
    // A label a designer reads: how many parts, the component they're in (spaced out), and their words.
    const component = componentsOf(els[0])?.replace(/^in /, "").split(" < ")[0];
    const spaced = component?.replace(/([a-z])([A-Z])/g, "$1 $2");
    const words = els.map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4).map((w) => w.slice(0, 12)).join(" ");
    const label = `${els.length} part${els.length === 1 ? "" : "s"}${spaced ? ` in ${spaced}` : ` (${[...kinds.keys()][0]})`}${words ? ` · ${words}` : ""}`;
    const classes = new Set<string>();
    for (const el of els) for (const node of [el, ...el.querySelectorAll("*")].slice(0, 80)) for (const c of node.classList) classes.add(c);
    const parts = els
      .slice(0, 8)
      .map((el) => {
        const words = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
        return `- ${el.tagName.toLowerCase()}${kindClass(el) ? `.${kindClass(el)}` : ""}${words ? ` “${words}”` : ""} (${componentsOf(el) ?? "no component"}): ${computedOf(el)}`;
      })
      .join("\n");
    return { label, styles: `${parts}\n\nThe app's CSS rules for them:\n${rulesForClasses([...classes]).slice(0, 8000)}` };
  };
  board = new ReferenceBoard({ endpoint, storagePrefix, say, describeParts, onChange: () => render(), skip: (el) => isProtected(options.rules, el) });
  board.mount(out("refs"));
  const addImages = (files: File[]) => board.addFiles(files);

  $<HTMLInputElement>("[data-in=files]").addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    void addImages([...(input.files ?? [])]);
    input.value = "";
  });
  const dropZone = out("drop");
  panel.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dropZone.classList.add("over");
  });
  panel.addEventListener("dragleave", (e) => {
    if (!panel.contains(e.relatedTarget as Node)) dropZone.classList.remove("over");
  });
  panel.addEventListener("drop", (e) => {
    dropZone.classList.remove("over");
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    void addImages([...e.dataTransfer.files]);
  });
  // ⌘V an image while the panel is open (not into one of the app's own fields).
  document.addEventListener(
    "paste",
    (e) => {
      if (panel.hidden) return;
      const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.kind === "file" && i.type.startsWith("image/")).map((i) => i.getAsFile()!).filter(Boolean);
      if (!files.length) return;
      const inApp = e.composedPath().some((n) => (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || (n instanceof HTMLElement && n.isContentEditable)) && !ours(n));
      if (inApp) return;
      e.preventDefault();
      void addImages(files);
    },
    true,
  );
  root.addEventListener("keydown", (e) => e.stopPropagation());

  const head = $(".head");
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button") || host.hasAttribute("data-docked")) return;
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

  setOpen(load(openKey, false));
  past = [snapshot()];
  applyVariant();
  render();
  // An apply that was still running when the page reloaded: pick up how it went.
  const recover = async () => {
    const got = await writer.recover();
    if (got === "waiting") {
      say("Still writing it into the code…");
      window.setTimeout(recover, 3000);
    } else if (got && "failed" in got) {
      say(`Couldn't put it in the app: ${got.failed}`, true);
    } else if (got) {
      // The component's styles look like this now; the variation on top would double it.
      on = -1;
      applyVariant();
      remember();
      say(`In the app: ${got.summary}`);
      render();
    }
  };
  void recover();

  return { open: () => setOpen(true), close: () => setOpen(false), isOpen: () => !panel.hidden };
}
