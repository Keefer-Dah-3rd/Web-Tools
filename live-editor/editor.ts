/**
 * Live editor: the page editor's toolbar for a published site. A bookmark loads it (served by
 * server.mjs on this Mac), so it appears only for you, only when you click it. Pick an element,
 * then remove, resize, restyle, recolour or retype it, or have Claude rewrite its words. Save
 * hands the edits to Claude to make permanent and publish.
 *
 * A second version of page-editor/editor.ts, kept apart so projects using the dev toolbar are
 * untouched. What it adds: `scope` (edit inside one element or its shadow root, e.g. an embed)
 * and live-site saving (the helper's endpoint, reload past the site's cache once published).
 */
import { slopIn } from "../page-editor/slop";

interface Edit {
  selector: string;
  /** Where the element is written, e.g. "concepts/src/long.tsx:412" (dev server only). */
  source?: string;
  tag: string;
  classes: string;
  text: string;
  removed?: boolean;
  /** Font size in px. */
  fontSize?: number;
  /** A key of the editor's type styles. */
  type?: string;
  color?: string;
  fill?: string;
  /** Scale, 1 = as designed. */
  scale?: number;
  /** Rewritten text: the element's new innerHTML, its plain text, and both as they were. */
  html?: string;
  newText?: string;
  wasHtml?: string;
  wasText?: string;
  /** What it was before any edit. */
  was: { fontSize: string; color: string; fill: string; width: number; height: number };
}

/** A text style the toolbar can snap an element to (CSS declarations, no selector). */
export interface TypeStyle {
  label: string;
  hint: string;
  css: string;
}
/** A named group of quick-pick colours: [name, hex] pairs. */
export interface SwatchGroup {
  group: string;
  colours: [string, string][];
}

export interface EditorOptions {
  /** Short id for the page, e.g. "home". Edits are stored and saved under it. */
  page: string;
  /** Text styles for the Type style buttons. Default: a plain H1–H4 / Body / Small set. */
  types?: Record<string, TypeStyle>;
  /** Colour swatches. Default: a neutral set. */
  swatches?: SwatchGroup[];
  /** Proper nouns the AI-pattern check may see capitalised (product, people, brands). */
  names?: string[];
  /** Where the dev-server half answers. Must match the Vite plugin's `endpoint`. */
  endpoint?: string;
  /** Prefix for this browser's saved edits and mood picks. */
  storagePrefix?: string;
  /** Removed from the front of source file paths in saves, e.g. the project folder. */
  sourceRoot?: string | RegExp;
  /**
   * Only edit inside this element (a CSS selector). If it has a shadow root, as an embedded
   * widget often does, the editor works inside that. Useful on a live site where only one part
   * of the page comes from your code.
   */
  scope?: string;
}

/** Set by live-server.mjs when the toolbar is loaded on a published site. */
declare global {
  interface Window {
    __pageEditorLive?: { endpoint: string; mounted?: boolean };
  }
}

const SYSTEM = `-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`;
export const DEFAULT_TYPES: Record<string, TypeStyle> = {
  h1: { label: "H1", hint: "700 · 56", css: `font-family: ${SYSTEM}; font-weight: 700; font-size: clamp(36px, 4.5vw, 56px); line-height: 1.05; letter-spacing: -0.01em;` },
  h2: { label: "H2", hint: "700 · 40", css: `font-family: ${SYSTEM}; font-weight: 700; font-size: clamp(28px, 3.2vw, 40px); line-height: 1.1; letter-spacing: -0.005em;` },
  h3: { label: "H3", hint: "650 · 28", css: `font-family: ${SYSTEM}; font-weight: 650; font-size: clamp(22px, 2.2vw, 28px); line-height: 1.15;` },
  h4: { label: "H4", hint: "650 · 20", css: `font-family: ${SYSTEM}; font-weight: 650; font-size: 20px; line-height: 1.25;` },
  body: { label: "Body", hint: "400 · 17", css: `font-family: ${SYSTEM}; font-weight: 400; font-size: 17px; line-height: 1.5;` },
  small: { label: "Small", hint: "400 · 14", css: `font-family: ${SYSTEM}; font-weight: 400; font-size: 14px; line-height: 1.5;` },
};
export const DEFAULT_SWATCHES: SwatchGroup[] = [
  {
    group: "Neutrals",
    colours: [["black", "#111111"], ["ink", "#2B2B2B"], ["grey 600", "#5F6368"], ["grey 400", "#9AA0A6"], ["grey 200", "#DADCE0"], ["grey 50", "#F4F5F6"], ["white", "#FFFFFF"]],
  },
  {
    group: "Accents",
    colours: [["red", "#E5484D"], ["orange", "#F76B15"], ["yellow", "#FFC53D"], ["green", "#30A46C"], ["blue", "#0090FF"], ["violet", "#6E56CF"], ["pink", "#D6409F"]],
  },
];

/** Quick picks for the Rewrite tool: a mood, and what to do to the words. */
const MOODS = ["Plain", "Specific", "Warm", "Dry", "Playful", "Confident", "Quiet", "Like I'm talking"];
const SHAPES = ["Shorter", "Use a number", "Say what happened", "First person", "Keep the meaning"];

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.box { position: fixed; pointer-events: none; z-index: 2147483000; border-radius: 3px; display: none; }
.box.hover { outline: 1.5px dashed #3ea0ff; outline-offset: 1px; }
.box.pick { outline: 2px solid #3ea0ff; outline-offset: 1px; }
.box .tag { position: absolute; left: -2px; top: -22px; background: #3ea0ff; color: #04121f; font: 600 11px/18px ui-monospace, "SF Mono", Menlo, monospace; padding: 0 6px; border-radius: 4px; white-space: nowrap; max-width: 60vw; overflow: hidden; text-overflow: ellipsis; }
.bar {
  position: fixed; right: 18px; top: 84px; width: 304px; max-height: calc(100vh - 110px); z-index: 2147483600;
  display: flex; flex-direction: column; color: #e9edf3; font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  background: rgba(22, 25, 31, 0.94); -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.bar.small { width: auto; }
.bar.small .body, .bar.small .foot { display: none; }
.head { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; cursor: grab; user-select: none; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.bar.small .head { border-bottom: 0; }
.head b { font-weight: 700; font-size: 12px; letter-spacing: 0.02em; flex: 1; white-space: nowrap; }
.head .dot { width: 8px; height: 8px; border-radius: 50%; background: #5b6472; }
.bar.on .head .dot { background: #3ea0ff; box-shadow: 0 0 0 3px rgba(62, 160, 255, 0.25); }
.body { overflow-y: auto; overflow-x: hidden; padding: 10px 12px 4px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.body > div, .tools > div, .fold-body > div { min-width: 0; }
.fold-head { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 38px; padding: 7px 10px 7px 8px; border-radius: 10px; background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(255, 255, 255, 0.14); color: #f3f6fa; font: 700 12.5px/1.2 inherit; font-family: inherit; letter-spacing: 0.02em; text-align: left; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.fold-head:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(62, 160, 255, 0.55); }
.fold-head:focus-visible { outline: 2px solid #3ea0ff; outline-offset: 2px; }
.fold.open > .fold-head { border-color: rgba(62, 160, 255, 0.45); background: rgba(62, 160, 255, 0.1); }
.fold-head em { font-style: normal; font-weight: 600; font-size: 11px; color: #bfe0ff; background: rgba(62, 160, 255, 0.16); border-radius: 999px; padding: 2px 8px; margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 58%; }
.caret { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #3ea0ff; color: #04121f; font-size: 11px; font-weight: 800; line-height: 1; transition: transform 0.15s; }
.fold.open > .fold-head .caret { transform: rotate(90deg); }
.fold.open > .fold-body { padding-top: 10px; }
.rw .fold-head:hover, .rw .fold.open > .fold-head { border-color: rgba(255, 176, 46, 0.6); background: rgba(255, 176, 46, 0.1); }
.rw .caret { background: #ffb02e; color: #1b1200; }
.rw .fold-head em { color: #ffd99a; background: rgba(255, 176, 46, 0.16); }
.fold:not(.open) > .fold-body { display: none; }
.fold-body > div + div { margin-top: 12px; }
.rw .fold { margin-bottom: 6px; }
.foot { padding: 10px 12px 12px; border-top: 1px solid rgba(255, 255, 255, 0.1); display: grid; gap: 8px; }
h4 { margin: 0 0 6px; font: 600 10px/1 inherit; font-family: inherit; letter-spacing: 0.09em; text-transform: uppercase; color: #8b95a5; display: flex; justify-content: space-between; align-items: center; }
h4 span { text-transform: none; letter-spacing: 0; font-weight: 500; color: #c5ccd8; }
button { appearance: none; font: inherit; color: inherit; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 7px; padding: 5px 9px; cursor: pointer; min-height: 28px; }
button:hover { background: rgba(255, 255, 255, 0.16); }
button:disabled { opacity: 0.35; cursor: default; }
button[data-act="target"][aria-pressed="true"] { background: #ffb02e; color: #1b1200; border-color: transparent; font-weight: 700; }
button[aria-pressed="true"] { background: #3ea0ff; color: #04121f; border-color: transparent; font-weight: 700; }
button.primary { background: #3ea0ff; color: #04121f; border-color: transparent; font-weight: 700; }
button.danger { color: #ff8f85; }
button.ghost { background: transparent; border-color: transparent; padding: 4px 6px; min-height: 24px; }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.row.fill > * { flex: 1; }
.who { font: 500 11px/1.35 ui-monospace, "SF Mono", Menlo, monospace; color: #c5ccd8; background: rgba(0, 0, 0, 0.3); border-radius: 7px; padding: 7px 8px; word-break: break-word; }
.who i { color: #8b95a5; font-style: normal; display: block; margin-top: 2px; }
.none { color: #8b95a5; padding: 4px 0 8px; }
.types { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.types button { padding: 5px 0; }
input[type="number"], input[type="text"] { font: inherit; color: inherit; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 7px; padding: 5px 7px; min-height: 28px; width: 62px; }
input[type="text"] { width: 84px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
input[type="color"] { appearance: none; -webkit-appearance: none; width: 30px; height: 28px; padding: 0; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 7px; background: none; cursor: pointer; }
input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 4px; }
input[type="range"] { flex: 1; accent-color: #3ea0ff; min-width: 0; }
.sw { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; margin-bottom: 6px; }
.sw button { padding: 0; min-height: 0; aspect-ratio: 1; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.28); }
.sw button:hover { transform: scale(1.18); }
.sw button[aria-pressed="true"] { box-shadow: 0 0 0 2px #16191f, 0 0 0 4px #3ea0ff; }
.grp { font-size: 10px; color: #8b95a5; margin: 0 0 4px; }
.list { display: grid; gap: 2px; max-height: 120px; overflow-y: auto; }
.list div { display: flex; gap: 6px; align-items: center; padding: 2px 0 2px 6px; border-radius: 6px; }
.list div:hover { background: rgba(255, 255, 255, 0.07); }
.list span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.list em { font-style: normal; color: #8b95a5; }
.status { color: #9fe0a8; min-height: 1.4em; }
.status.bad { color: #ff8f85; }
kbd { font: 600 10px ui-monospace, Menlo, monospace; background: rgba(255, 255, 255, 0.12); border-radius: 4px; padding: 1px 4px; }
.keys { color: #8b95a5; font-size: 11px; line-height: 1.7; }
.editing-tip { margin-top: 6px; color: #ffd27a; font-size: 11px; line-height: 1.6; }
.rw { border: 1px solid rgba(255, 176, 46, 0.35); background: rgba(255, 176, 46, 0.06); border-radius: 10px; padding: 9px 9px 10px; margin-bottom: 12px; }
.rw h4 { color: #ffc766; }
.flags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }
.flags span, .opt .flags span { font-size: 10.5px; line-height: 1.5; padding: 0 6px; border-radius: 6px; background: rgba(255, 120, 100, 0.16); color: #ffb3a8; }
.flags .ok { background: rgba(120, 220, 140, 0.14); color: #a8e8b4; }
textarea { font: inherit; color: inherit; width: 100%; resize: vertical; min-height: 44px; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 7px; padding: 6px 8px; }
textarea::placeholder { color: #7d8796; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.chips button { min-height: 24px; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
.chips.shape button { border-style: dashed; }
.opts { display: grid; gap: 5px; margin-top: 8px; }
.opt { text-align: left; display: grid; gap: 3px; padding: 7px 8px; border-radius: 8px; }
.opt b { font-weight: 650; font-size: 12.5px; line-height: 1.3; color: #fff; }
.opt i { font-style: normal; color: #9aa4b2; font-size: 11px; line-height: 1.35; }
.opt.used { outline: 2px solid #ffb02e; }
.diag { color: #c5ccd8; font-size: 11px; line-height: 1.45; margin-top: 8px; }
.via { color: #7d8796; font-size: 10.5px; }
.tick { display: flex; align-items: center; gap: 6px; margin-top: 7px; color: #9aa4b2; font-size: 11px; cursor: pointer; }
.tick input { accent-color: #ffb02e; margin: 0; }
.sel-rw, .pass-out { margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(255, 176, 46, 0.25); }
.sel-name { margin: 0 0 5px; }
.bar.targeting .head .dot { background: #ffb02e; box-shadow: 0 0 0 3px rgba(255, 176, 46, 0.3); }
.box.hover.t { outline-color: #ffb02e; }
.tbox { position: fixed; pointer-events: none; z-index: 2147482900; outline: 2px dashed #ffb02e; outline-offset: 3px; border-radius: 3px; }
.tbox span { position: absolute; left: -12px; top: -12px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #ffb02e; color: #1b1200; font: 700 11px/20px -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35); }
.targets { margin-top: 8px; }
.tip { margin: 0 0 5px; }
.tlist { display: grid; gap: 3px; }
.tlist div { display: flex; gap: 6px; align-items: center; font-size: 11.5px; }
.tlist b { flex: none; width: 18px; height: 18px; border-radius: 9px; background: #ffb02e; color: #1b1200; font-size: 10.5px; line-height: 18px; text-align: center; }
.tlist span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #c5ccd8; cursor: pointer; }
.ph .n { display: inline-block; min-width: 18px; height: 18px; border-radius: 9px; background: #ffb02e; color: #1b1200; font-size: 10.5px; font-weight: 700; line-height: 18px; text-align: center; margin-right: 5px; }
.ph { padding: 8px 0 9px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
.ph:last-child { border-bottom: 0; }
.ph .was { display: block; color: #c5ccd8; font-size: 11.5px; margin-bottom: 4px; cursor: pointer; text-decoration: underline dotted rgba(255, 255, 255, 0.3); text-underline-offset: 3px; }
.ph .was s { color: #8b95a5; }
.ph .opts { margin-top: 5px; }
`;

const HTML = `
<div class="box hover"></div>
<div class="box pick"><span class="tag"></span></div>
<div class="marks"></div>
<div class="bar" role="region" aria-label="Page editor (review tool)">
  <div class="head"><i class="dot"></i><b>Edit page</b>
    <button data-act="mode" aria-pressed="false" title="Pick elements by clicking them (E)">Select</button>
    <button data-act="fold" class="ghost" title="Collapse">▾</button>
  </div>
  <div class="body">
    <div class="rw">
      <h4>Rewrite with AI <span class="rw-n"></span></h4>
      <div class="fold" data-fold="mood">
        <button class="fold-head" data-foldbtn="mood"><span class="caret">▸</span> Mood <em class="mood-sum"></em></button>
        <div class="fold-body">
          <textarea class="mood" rows="2" placeholder="Describe the mood: e.g. dry and specific, like I'm telling another designer" spellcheck="true"></textarea>
          <div class="chips mood-chips"></div>
          <div class="chips shape"></div>
        </div>
      </div>
      <div class="row fill">
        <button data-act="target" title="Click text on the page to choose exactly what to rewrite (B)">◎ Pick blocks</button>
        <button data-act="pass" title="Rewrite the page's headings together, a few options each">✦ All headings</button>
      </div>
      <div class="targets" hidden>
        <p class="grp tip">Click text on the page to add it, click again to drop it.</p>
        <div class="tlist"></div>
        <div class="row fill" style="margin-top:6px">
          <button data-act="target-go" class="primary">✦ Rewrite</button>
          <button data-act="target-clear" class="ghost">Clear</button>
        </div>
      </div>
      <label class="tick"><input type="checkbox" class="only-flagged" checked> All headings: only the ones that read as AI</label>
      <div class="sel-rw" hidden>
        <p class="grp sel-name"></p>
        <div class="flags now"></div>
        <div class="row fill" style="margin-top:6px">
          <button data-act="rewrite" title="Five options for the selected text (R)">✦ Write 5 options</button>
        </div>
        <div class="diag sel-diag" hidden></div>
        <div class="opts"></div>
        <div class="row fill more" style="margin-top:6px" hidden>
          <button data-act="rewrite-more">More, different</button>
          <button data-act="rewrite-clear" class="ghost">Clear</button>
        </div>
      </div>
      <div class="pass-out" hidden>
        <div class="diag pass-diag"></div>
        <div class="pass-list"></div>
        <div class="row fill" style="margin-top:6px">
          <button data-act="again" title="Ask again for fresh options">Again</button>
          <button data-act="pass-clear" class="ghost">Clear</button>
        </div>
      </div>
    </div>
    <div class="fold" data-fold="selected">
      <button class="fold-head" data-foldbtn="selected"><span class="caret">▸</span> Selected <em class="sel-sum"></em></button>
      <div class="fold-body">
      <div class="none">Turn on <b>Select</b> (or press E), then click anything on the page.</div>
      <div class="sel" hidden>
        <div class="who"></div>
        <div class="row fill" style="margin-top:6px">
          <button data-act="parent" title="Select the element around it (↑)">↑ Parent</button>
          <button data-act="child" title="Select the first element inside it (↓)">↓ Inside</button>
          <button data-act="remove" class="danger" title="Remove from the page (Delete)">Remove</button>
        </div>
        <div class="row fill" style="margin-top:6px">
          <button data-act="text" title="Type straight into it (T, or double-click). Enter or click away to keep, Esc to cancel">✎ Edit text</button>
          <button data-act="text-reset" class="ghost" title="Put the original words back">Original text</button>
        </div>
        <div class="editing-tip" hidden>Typing into the page. <kbd>Enter</kbd> keeps it, <kbd>⇧Enter</kbd> new line, <kbd>Esc</kbd> cancels.</div>
      </div>
      </div>
    </div>
    <div class="tools fold" data-fold="style" hidden>
      <button class="fold-head" data-foldbtn="style"><span class="caret">▸</span> Style <em>size, type, colour, scale</em></button>
      <div class="fold-body">
      <div>
        <h4>Text size <span class="fs"></span></h4>
        <div class="row">
          <button data-act="smaller" title="Smaller">A−</button>
          <input type="number" class="size" min="6" max="400" step="1" aria-label="Font size in pixels">
          <button data-act="bigger" title="Bigger">A+</button>
          <button data-act="size-reset" class="ghost">Reset</button>
        </div>
      </div>
      <div style="margin-top:12px">
        <h4>Type style <span>portfolio system</span></h4>
        <div class="types"></div>
      </div>
      <div style="margin-top:12px">
        <h4>Colour <span class="row" style="gap:4px"><button data-target="color" aria-pressed="true">Text</button><button data-target="fill" aria-pressed="false">Fill</button></span></h4>
        <div class="swatches"></div>
        <div class="row">
          <input type="color" class="picker" aria-label="Custom colour">
          <input type="text" class="hex" placeholder="#FF741B" aria-label="Hex colour" spellcheck="false">
          <button data-act="colour-reset" class="ghost">Reset</button>
        </div>
      </div>
      <div style="margin-top:12px">
        <h4>Shrink / grow <span class="pct"></span></h4>
        <div class="row">
          <button data-act="shrink" title="Shrink 5%">−</button>
          <input type="range" class="scale" min="30" max="250" step="1" aria-label="Scale in percent">
          <button data-act="grow" title="Grow 5%">+</button>
          <button data-act="scale-reset" class="ghost">Reset</button>
        </div>
      </div>
      </div>
    </div>
    <div>
      <h4>Changes <span class="count">0</span></h4>
      <div class="list"></div>
    </div>
    <div class="fold" data-fold="keys">
      <button class="fold-head" data-foldbtn="keys"><span class="caret">▸</span> Shortcuts</button>
      <div class="fold-body keys"><kbd>E</kbd> select on/off · <kbd>G</kbd> column grid · <kbd>↑</kbd><kbd>↓</kbd> parent/inside · <kbd>T</kbd> edit text · <kbd>B</kbd> pick blocks · <kbd>R</kbd> rewrite · <kbd>Delete</kbd> remove · <kbd>⌘Z</kbd> undo · <kbd>Esc</kbd> deselect</div>
    </div>
  </div>
  <div class="foot">
    <div class="row fill">
      <button data-act="undo">Undo</button>
      <button data-act="reset-all" class="danger">Reset all</button>
      <button data-act="copy">Copy</button>
    </div>
    <button data-act="send" class="primary" title="Save and send to Claude (⌘S)">Save</button>
    <div class="status" aria-live="polite"></div>
  </div>
</div>
`;

const rgbToHex = (value: string): string => {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return value;
  const [r, g, b] = m[1].split(/[,\s/]+/).map(Number);
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
};

let mounted = false;

export function mountEditor(options: EditorOptions | string): void {
  const opts: EditorOptions = typeof options === "string" ? { page: options } : options;
  const page = opts.page;
  const TYPE = opts.types ?? DEFAULT_TYPES;
  const SWATCHES = opts.swatches ?? DEFAULT_SWATCHES;
  const names = opts.names ?? [];
  const live = typeof window !== "undefined" ? window.__pageEditorLive : undefined;
  const endpoint = (opts.endpoint ?? live?.endpoint ?? "/__page-editor").replace(/\/$/, "");
  const prefix = opts.storagePrefix ?? "live-editor";
  const sourceRoot = opts.sourceRoot ?? "";
  if (mounted || typeof document === "undefined" || document.getElementById("live-editor")) return;
  // Add ?noedit to a page's address to see it without the toolbar.
  if (new URLSearchParams(location.search).has("noedit")) return;
  // The part of the page that can be edited, and where its elements are looked up.
  const scopeEl = opts.scope ? document.querySelector(opts.scope) : null;
  if (opts.scope && !scopeEl) {
    window.alert(`The page editor can't find ${opts.scope} on this page.`);
    return;
  }
  const shadow = scopeEl?.shadowRoot ?? null;
  const pageRoot: Document | ShadowRoot = shadow ?? document;
  mounted = true;
  if (live) live.mounted = true;

  const host = document.createElement("div");
  host.id = "live-editor";
  host.setAttribute("data-review-tool", "");
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${STYLE}</style>${HTML}`;
  const sheet = document.createElement("style");
  sheet.id = "live-editor-rules";
  // Inside a shadow root, page rules only reach its elements from a sheet of its own.
  (shadow ?? document.head).appendChild(sheet);

  const $ = <T extends HTMLElement>(q: string) => root.querySelector(q) as T;
  const bar = $(".bar");
  const hoverBox = $(".box.hover");
  const pickBox = $(".box.pick");
  const status = $(".status");
  const storeKey = `${prefix}:edits:${page}`;

  let edits: Edit[] = [];
  let history: string[] = [];
  let picked: Element | null = null;
  let hovered: Element | null = null;
  let selecting = false; // off at first, so the page still plays; Select or E turns picking on
  let target: "color" | "fill" = "color";
  /** The element being typed into, and its innerHTML before typing started. */
  let editing: HTMLElement | null = null;
  let editingWas = "";
  /** The Rewrite tool: the element the options are for, the options shown, and the mood picks (kept per browser). */
  let rwFor: Element | null = null;
  let rwOptions: { text: string; why: string }[] = [];
  let rwAsked: string[] = [];
  let rwBusy = 0;
  let rwDiag = "";
  let rwVia = "";
  type PassItem = { id: string; n?: number; selector: string; text: string; options: { text: string; why: string }[]; used?: string };
  let passItems: PassItem[] = [];
  /** Pick blocks: the text blocks chosen on the page, in the order picked. */
  let targeting = false;
  let targets: Element[] = [];
  let lastRun: "headings" | "blocks" = "headings";
  let numbered = false;
  let passDiag = "";
  const moodKey = `${prefix}:mood`;
  // Which sections are open (Style, Mood and Shortcuts start folded); remembered per browser.
  const foldKey = `${prefix}:open`;
  let open: string[] = [];
  try {
    open = JSON.parse(localStorage.getItem(foldKey) ?? '["selected"]');
  } catch {
    open = [];
  }
  let mood: { words: string; picks: string[] } = { words: "", picks: ["Specific", "Like I'm talking"] };
  try {
    mood = { ...mood, ...JSON.parse(localStorage.getItem(moodKey) ?? "{}") };
  } catch {
    /* defaults */
  }
  /** Elements whose words we replaced, with their original innerHTML, so a revert can put it back. */
  const textApplied = new Map<string, string>();

  try {
    edits = JSON.parse(localStorage.getItem(storeKey) ?? "[]");
  } catch {
    edits = [];
  }

  // ---- finding and naming elements

  const ours = (node: EventTarget | null) => node === host || (node instanceof Node && (host.contains(node) || node.getRootNode() === root));
  /** Whether an element is in the editable part of the page (all of it, unless scope is set). */
  const inScope = (el: Element) => !scopeEl || (shadow ? el.getRootNode() === shadow : scopeEl.contains(el));
  /** What an event really landed on, inside any shadow root (event.target stops at the host). */
  const hit = (event: Event): Element | null => {
    const node = event.composedPath()[0];
    return node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
  };

  /** A selector that finds this element again after a reload: nth-child steps down from #root. */
  const selectorOf = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.id) {
        parts.unshift(`#${CSS_ESCAPE(node.id)}`);
        break;
      }
      const parent: Element | null = node.parentElement;
      if (!parent) {
        // The top of a shadow root: anchor to it with :host, so the rule can't match deeper down.
        if (shadow && node.parentNode === shadow) {
          parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${Array.prototype.indexOf.call(shadow.children, node) + 1})`);
          parts.unshift(":host");
        }
        break;
      }
      const index = Array.prototype.indexOf.call(parent.children, node) + 1;
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
      node = parent;
    }
    return parts.join(" > ");
  };
  const CSS_ESCAPE = (s: string) => (typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(s) : s);

  /** The JSX file and line that wrote this element (React's dev build records it). */
  const sourceOf = (el: Element): string | undefined => {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    let fiber = key ? (el as unknown as Record<string, { _debugSource?: { fileName: string; lineNumber: number }; return?: unknown }>)[key] : undefined;
    for (let i = 0; fiber && i < 6; i++) {
      const src = fiber._debugSource;
      if (src) return `${sourceRoot ? src.fileName.replace(sourceRoot, "") : src.fileName}:${src.lineNumber}`;
      fiber = fiber.return as typeof fiber;
    }
    return undefined;
  };

  const nameOf = (el: Element): string => {
    const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${cls}`;
  };
  const textOf = (el: Element): string => (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 70);

  const find = (selector: string): Element | null => {
    try {
      // :host only works in a stylesheet, so look for the rest and keep the one with this exact path.
      if (shadow && selector.startsWith(":host > ")) {
        return [...shadow.querySelectorAll(selector.slice(8))].find((el) => selectorOf(el) === selector) ?? null;
      }
      return pageRoot.querySelector(selector);
    } catch {
      return null;
    }
  };

  // ---- the edits

  const editFor = (el: Element, create: boolean): Edit | undefined => {
    const selector = selectorOf(el);
    let edit = edits.find((e) => e.selector === selector);
    if (!edit && create) {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      edit = {
        selector,
        source: sourceOf(el),
        tag: el.tagName.toLowerCase(),
        classes: typeof el.className === "string" ? el.className : "",
        text: textOf(el),
        was: { fontSize: cs.fontSize, color: rgbToHex(cs.color), fill: rgbToHex(cs.backgroundColor), width: Math.round(rect.width), height: Math.round(rect.height) },
      };
      edits.push(edit);
    }
    return edit;
  };

  const isEmpty = (e: Edit) => !e.removed && e.fontSize == null && !e.type && !e.color && !e.fill && (e.scale == null || e.scale === 1) && e.html == null;

  /** Text edits can't be CSS, so they are written into the page (and again whenever React redraws it). */
  const plainOf = (el: HTMLElement) => el.innerText.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
  const applyTexts = () => {
    const wanted = new Set<string>();
    for (const e of edits) {
      if (e.html == null) continue;
      wanted.add(e.selector);
      const el = find(e.selector);
      if (!el || el === editing || el.innerHTML === e.html) continue;
      if (!textApplied.has(e.selector)) textApplied.set(e.selector, e.wasHtml ?? el.innerHTML);
      el.innerHTML = e.html;
    }
    for (const [selector, was] of textApplied) {
      if (wanted.has(selector)) continue;
      const el = find(selector);
      if (el && el !== editing && el.innerHTML !== was) el.innerHTML = was;
      textApplied.delete(selector);
    }
  };
  let reapply = 0;
  new MutationObserver(() => {
    if (!edits.some((e) => e.html != null) && !textApplied.size) return;
    window.clearTimeout(reapply);
    reapply = window.setTimeout(applyTexts, 60);
  }).observe(shadow ?? document.body, { childList: true, subtree: true, characterData: true });

  /** A collapsed range at a point on screen, looking inside the shadow root too. */
  const caretAt = (x: number, y: number): Range | null => {
    const withShadow = document as Document & { caretPositionFromPoint?: (x: number, y: number, o?: { shadowRoots?: ShadowRoot[] }) => { offsetNode: Node; offset: number } | null };
    if (typeof withShadow.caretPositionFromPoint === "function") {
      const pos = withShadow.caretPositionFromPoint(x, y, shadow ? { shadowRoots: [shadow] } : undefined);
      if (!pos) return null;
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      return range;
    }
    return document.caretRangeFromPoint(x, y);
  };

  /** Start typing into the picked element: the cursor goes where it was double-clicked, else at the end. */
  const startTyping = (at?: { x: number; y: number }) => {
    if (!picked || !(picked instanceof HTMLElement) || editing) return;
    if (!plainOf(picked)) return say("That has no words in it. Pick the text itself (↓ Inside).", true);
    editing = picked;
    editingWas = editing.innerHTML;
    editing.contentEditable = "true";
    editing.spellcheck = true;
    editing.style.outline = "2px solid #ffb02e";
    editing.style.outlineOffset = "3px";
    editing.style.cursor = "text";
    editing.focus();
    let range: Range | null = at ? caretAt(at.x, at.y) : null;
    if (!range || !editing.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(editing);
      range.collapse(false);
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    place(hoverBox, null);
    render();
  };
  const stopTyping = (keep: boolean) => {
    if (!editing) return;
    const el = editing;
    editing = null;
    el.removeAttribute("contenteditable");
    el.removeAttribute("spellcheck");
    el.style.outline = "";
    el.style.outlineOffset = "";
    el.style.cursor = "";
    if (!el.getAttribute("style")) el.removeAttribute("style");
    window.getSelection()?.removeAllRanges();
    if (!keep || el.innerHTML === editingWas) {
      el.innerHTML = editingWas;
      render();
      return;
    }
    recordText(el, editingWas);
    say("Text changed. Save sends it to Claude.");
  };
  /** Keep the element's new words as an edit; before is its innerHTML before this change. */
  function recordText(el: Element, before: string) {
    const edit = editFor(el, true)!;
    if (edit.wasHtml == null) {
      // First rewrite of this element: remember the original words (before is the page as built).
      const scratch = document.createElement("div");
      scratch.innerHTML = before;
      edit.wasHtml = before;
      edit.wasText = (scratch.textContent ?? "").replace(/\s+/g, " ").trim();
    }
    if (el.innerHTML === edit.wasHtml) {
      edit.html = edit.newText = undefined;
    } else {
      edit.html = el.innerHTML;
      edit.newText = plainOf(el as HTMLElement);
    }
    if (!textApplied.has(edit.selector)) textApplied.set(edit.selector, edit.wasHtml);
    commit();
  }

  // ---- the Rewrite tool

  const isHeading = (el: Element) => /^h[1-3]$/i.test(el.tagName) || /\b(title|t-display|t-big|t-h[1-3])\b/.test(typeof el.className === "string" ? el.className : "");
  const roleOf = (el: Element): string => {
    const cls = typeof el.className === "string" ? el.className : "";
    const tag = el.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || /\btitle\b/.test(cls)) return `section heading (<${tag}>, big display type)`;
    if (tag === "h3") return "subheading inside a section (<h3>)";
    if (tag === "blockquote" || /\bpull\b/.test(cls)) return "pull quote (big display type)";
    if (/t-display|t-big/.test(cls)) return `large display line (<${tag}>)`;
    if (/t-micro|t-label|t-num/.test(cls)) return "small label or caption";
    return `body text (<${tag}>)`;
  };
  const flagsHtml = (found: string[]) => (found.length ? found.map((f) => `<span>${f}</span>`).join("") : `<span class="ok">no AI patterns found</span>`);
  const saveMood = () => {
    try {
      localStorage.setItem(moodKey, JSON.stringify(mood));
    } catch {
      /* private mode */
    }
  };

  const rewrite = async (more: boolean) => {
    if (!picked || rwBusy) return;
    if (editing) stopTyping(true);
    const el = picked;
    const text = plainOf(el as HTMLElement);
    if (!text) return say("That has no words in it. Pick the text itself (↓ Inside).", true);
    if (rwFor !== el) {
      rwOptions = [];
      rwAsked = [];
      rwDiag = "";
    }
    rwFor = el;
    if (!more) rwOptions = [];
    const section = el.closest("section");
    const heading = section?.querySelector("h2, h1");
    const edit = editFor(el, false);
    const body = {
      page,
      count: 5,
      text,
      original: edit?.wasText ?? text,
      role: roleOf(el),
      section: heading && heading !== el ? (heading as HTMLElement).innerText : section?.getAttribute("data-stop") ?? "",
      nearby: (section as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 1200) ?? "",
      headings: [...pageRoot.querySelectorAll("main h1, main h2, main h3")].map((h) => (h as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean),
      mood: mood.words,
      chips: mood.picks,
      avoid: [...rwAsked],
    };
    startBusy("options");
    try {
      const res = await fetch(`${endpoint}/rewrite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { options?: { text: string; why: string }[]; diagnosis?: string; via?: string; error?: string };
      if (!res.ok || !data.options) throw new Error(data.error ?? `The dev server said ${res.status}.`);
      const fresh = data.options.filter((o) => o && typeof o.text === "string" && o.text.trim()).map((o) => ({ text: o.text.trim(), why: String(o.why ?? "").trim() }));
      rwOptions = [...rwOptions, ...fresh];
      rwAsked.push(...fresh.map((o) => o.text));
      rwDiag = data.diagnosis ?? rwDiag;
      rwVia = data.via ?? "";
      say(`${fresh.length} options. Click one to use it; Save when you're happy.`);
    } catch (e) {
      say(String((e as Error).message || e), true);
    } finally {
      stopBusy();
    }
  };

  const startBusy = (what: string) => {
    const started = Date.now();
    say(`Claude is writing ${what}…`);
    rwBusy = window.setInterval(() => {
      const secs = Math.round((Date.now() - started) / 1000);
      say(`Claude is writing ${what}… ${secs}s${rwVia === "Claude session" || secs > 25 ? " (answered by the open Claude session)" : ""}`);
    }, 1000);
    render();
  };
  const stopBusy = () => {
    window.clearInterval(rwBusy);
    rwBusy = 0;
    render();
  };

  /** The block of text a click lands in: the paragraph, heading, list item or quote around it. */
  const BLOCKS = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, dt, dd, td, th, caption, summary";
  const blockOf = (el: Element | null): Element | null => {
    if (!el || ours(el) || !inScope(el)) return null;
    const block = el.closest(BLOCKS) ?? el.closest("a, button, label") ?? el;
    return block instanceof HTMLElement && plainOf(block) && block !== document.body ? block : null;
  };
  const toggleTarget = (el: Element | null) => {
    if (!el) return say("No words there. Click on some text.", true);
    const at = targets.indexOf(el);
    if (at >= 0) targets.splice(at, 1);
    else {
      // Picking a block inside one already picked (or around one) replaces it.
      targets = targets.filter((t) => !t.contains(el) && !el.contains(t));
      targets.push(el);
    }
    render();
  };
  const setTargeting = (on: boolean) => {
    targeting = on;
    if (on) selecting = false;
    hovered = null;
    place(hoverBox, null);
    render();
  };
  const marks = $(".marks");
  const drawMarks = () => {
    targets = targets.filter((t) => t.isConnected);
    marks.innerHTML = targets
      .map((t, i) => {
        const r = t.getBoundingClientRect();
        return `<div class="tbox" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"><span>${i + 1}</span></div>`;
      })
      .join("");
  };

  /** Rewrite a set of text blocks together: three options each, or five for a single block. */
  const runSet = async (els: Element[], kind: "headings" | "blocks") => {
    if (rwBusy || !els.length) return;
    if (editing) stopTyping(true);
    lastRun = kind;
    const items = els.map((el, i) => ({ el: el as HTMLElement, id: `b${i + 1}` }));
    const body = {
      page,
      mode: "set",
      count: items.length === 1 ? 5 : 3,
      headings: [...pageRoot.querySelectorAll<HTMLElement>("main h1, main h2, main h3, h1, h2")].filter((h, i, all) => all.indexOf(h) === i && !ours(h)).map((h) => plainOf(h)).filter(Boolean),
      mood: mood.words,
      chips: mood.picks,
      items: items.map(({ el, id }) => ({
        id,
        role: roleOf(el),
        text: plainOf(el),
        original: editFor(el, false)?.wasText ?? plainOf(el),
        nearby: ((el.closest("section, article, main") as HTMLElement | null) ?? el.parentElement)?.innerText.replace(/\s+/g, " ").slice(0, 700) ?? "",
      })),
    };
    const what = kind === "headings" ? "heading" : "block";
    startBusy(`options for ${items.length} ${what}${items.length === 1 ? "" : "s"}`);
    try {
      const res = await fetch(`${endpoint}/rewrite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { headings?: { id: string; options: { text: string; why: string }[] }[]; diagnosis?: string; via?: string; error?: string };
      if (!res.ok || !data.headings) throw new Error(data.error ?? `The dev server said ${res.status}.`);
      numbered = kind === "blocks";
      passItems = items.map(({ el, id }, i) => ({
        id,
        n: i + 1,
        selector: selectorOf(el),
        text: plainOf(el),
        options: (data.headings!.find((h) => h.id === id)?.options ?? []).filter((o) => o && typeof o.text === "string" && o.text.trim()).map((o) => ({ text: o.text.trim(), why: String(o.why ?? "").trim() })),
      }));
      passDiag = data.diagnosis ?? "";
      rwVia = data.via ?? "";
      if (kind === "blocks") setTargeting(false);
      say(`Options for ${passItems.length} ${what}${passItems.length === 1 ? "" : "s"}. Click one to use it, then Save.`);
    } catch (e) {
      say(String((e as Error).message || e), true);
    } finally {
      stopBusy();
    }
  };

  /** Every heading on the page (or only the ones that read as AI), rewritten together. */
  const headingsPass = () => {
    const onlyFlagged = ($(".only-flagged") as HTMLInputElement).checked;
    const all = [...pageRoot.querySelectorAll<HTMLElement>("main h1, main h2, main h3, main blockquote")].filter((el) => !ours(el) && plainOf(el));
    const chosen = all.filter((el) => !onlyFlagged || slopIn(plainOf(el), true, names).length).slice(0, 24);
    if (!chosen.length) return say("No headings read as AI. Untick “only the ones that read as AI” to rewrite them all anyway.");
    void runSet(chosen, "headings");
  };

  const usePassOption = (key: string) => {
    const [i, j] = key.split(":").map(Number);
    const item = passItems[i];
    const option = item?.options[j];
    const el = item ? find(item.selector) : null;
    if (!item || !option || !el) return say("That text has moved on the page. Ask again.", true);
    const before = el.innerHTML;
    el.textContent = option.text;
    if (el.innerHTML !== before) recordText(el, before);
    item.used = option.text;
    render();
    say("Using that one. ⌘Z or ✕ under Changes to go back.");
  };

  const useOption = (i: number) => {
    const option = rwOptions[i];
    const el = rwFor;
    if (!option || !el || !el.isConnected) return say("That element has gone. Pick it again.", true);
    const before = el.innerHTML;
    el.textContent = option.text;
    if (el.innerHTML === before) return;
    recordText(el, before);
    pick(el);
    say("Using that one. ⌘Z or Original text to go back.");
  };

  const rules = (): string =>
    edits
      .map((e) => {
        let css = "";
        if (e.type && TYPE[e.type]) css += TYPE[e.type].css.replace(/;/g, " !important;");
        if (e.fontSize != null) css += ` font-size: ${e.fontSize}px !important;`;
        if (e.color) css += ` color: ${e.color} !important;`;
        if (e.fill) css += ` background: ${e.fill} !important;`;
        if (e.scale != null && e.scale !== 1) css += ` zoom: ${e.scale} !important;`;
        if (e.removed) css += " display: none !important;";
        return css ? `${e.selector} {${css} }` : "";
      })
      .join("\n");

  const commit = (remember = true) => {
    edits = edits.filter((e) => !isEmpty(e));
    sheet.textContent = rules();
    applyTexts();
    try {
      localStorage.setItem(storeKey, JSON.stringify(edits));
    } catch {
      /* private mode: edits still apply for this visit */
    }
    if (remember) history.push(JSON.stringify(edits));
    if (history.length > 80) history.shift();
    render();
  };

  const change = (apply: (edit: Edit, el: Element) => void) => {
    if (!picked) return;
    const edit = editFor(picked, true);
    if (!edit) return;
    apply(edit, picked);
    commit();
  };

  const undo = () => {
    if (history.length < 2) {
      if (edits.length) {
        edits = [];
        history = ["[]"];
        commit(false);
      }
      return;
    }
    history.pop();
    edits = JSON.parse(history[history.length - 1]);
    commit(false);
    say("Undone.");
  };

  const payload = () => ({
    page,
    url: location.href,
    live: !!live,
    savedAt: new Date().toISOString(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    note: "Live edits from the page editor. selector finds the element; source is the JSX file:line that wrote it; was holds the values before editing; scale is CSS zoom (1 = as designed); wasText → newText is rewritten copy (html is the element's new innerHTML).",
    edits: edits.map((e) => ({ ...e, typeStyle: e.type ? `${TYPE[e.type]?.label} (${TYPE[e.type]?.hint})` : undefined })),
  });

  const say = (text: string, bad = false) => {
    status.textContent = text;
    status.classList.toggle("bad", bad);
  };

  // ---- the toolbar

  const types = $(".types");
  types.innerHTML = Object.entries(TYPE)
    .map(([id, t]) => `<button data-type="${id}" title="${t.hint}">${t.label}</button>`)
    .join("");
  $(".swatches").innerHTML = SWATCHES.map(
    (g) => `<p class="grp">${g.group}</p><div class="sw">${g.colours.map(([name, hex]) => `<button data-colour="${hex}" title="${name} ${hex}" aria-label="${name} ${hex}" style="background:${hex}"></button>`).join("")}</div>`,
  ).join("");

  $(".mood-chips").innerHTML = MOODS.map((m) => `<button data-chip="${m}">${m}</button>`).join("");
  $(".shape").innerHTML = SHAPES.map((m) => `<button data-chip="${m}">${m}</button>`).join("");
  ($(".mood") as HTMLTextAreaElement).value = mood.words;
  $(".mood").addEventListener("input", (event) => {
    mood.words = (event.target as HTMLTextAreaElement).value;
    saveMood();
  });

  const place = (box: HTMLElement, el: Element | null) => {
    if (!el || !el.isConnected) {
      box.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
  };

  function render() {
    const edit = picked ? edits.find((e) => e.selector === selectorOf(picked!)) : undefined;
    $(".none").hidden = !!picked;
    $(".sel").hidden = !picked;
    $(".tools").hidden = !picked;
    $(".editing-tip").hidden = !editing;
    const words = picked instanceof HTMLElement ? plainOf(picked) : "";
    $(".sel-rw").hidden = !words;
    $("[data-act=rewrite]").toggleAttribute("disabled", !words || !!rwBusy);
    root.querySelectorAll<HTMLElement>("[data-act=pass]").forEach((b) => b.toggleAttribute("disabled", !!rwBusy));
    root.querySelectorAll<HTMLElement>("[data-chip]").forEach((b) => b.setAttribute("aria-pressed", String(mood.picks.includes(b.dataset.chip!))));
    root.querySelectorAll<HTMLElement>("[data-fold]").forEach((f) => f.classList.toggle("open", open.includes(f.dataset.fold!)));
    $(".sel-sum").textContent = picked ? (textOf(picked) ? `“${textOf(picked).slice(0, 28)}${textOf(picked).length > 28 ? "…" : ""}”` : nameOf(picked)) : "nothing yet";
    $(".mood-sum").textContent = [mood.words.trim() && `“${mood.words.trim().slice(0, 24)}${mood.words.trim().length > 24 ? "…" : ""}”`, ...mood.picks].filter(Boolean).join(", ") || "none";
    bar.classList.toggle("targeting", targeting);
    $("[data-act=target]").setAttribute("aria-pressed", String(targeting));
    $("[data-act=target]").textContent = targeting ? "◎ Picking… (done)" : "◎ Pick blocks";
    targets = targets.filter((t) => t.isConnected);
    $(".targets").hidden = !targeting && !targets.length;
    $(".tlist").innerHTML = targets
      .map((t, i) => `<div><b>${i + 1}</b><span data-tgo="${i}" title="Show it on the page">${plainOf(t as HTMLElement).slice(0, 60).replace(/</g, "&lt;")}</span><button class="ghost" data-tdrop="${i}" title="Drop it">✕</button></div>`)
      .join("");
    const go = $("[data-act=target-go]");
    go.toggleAttribute("disabled", !targets.length || !!rwBusy);
    go.textContent = targets.length > 1 ? `✦ Rewrite these ${targets.length}` : "✦ Rewrite this block";
    drawMarks();
    $(".pass-out").hidden = !passItems.length;
    $(".pass-diag").innerHTML = passDiag ? `${passDiag.replace(/</g, "&lt;")} <span class="via">${rwVia ? `· ${rwVia}` : ""}</span>` : "";
    $(".pass-list").innerHTML = passItems
      .map((item, i) => {
        const opts = item.options
          .map((o, j) => {
            const found = slopIn(o.text, true, names);
            return `<button class="opt${item.used === o.text ? " used" : ""}" data-popt="${i}:${j}"><b>${o.text.replace(/</g, "&lt;")}</b>${o.why ? `<i>${o.why.replace(/</g, "&lt;")}</i>` : ""}${found.length ? `<span class="flags">${flagsHtml(found)}</span>` : ""}</button>`;
          })
          .join("");
        const flags = slopIn(item.text, true, names);
        return `<div class="ph">${numbered && item.n ? `<span class="n">${item.n}</span>` : ""}<span class="was" data-goto="${i}" title="Show it on the page">${item.used ? `<s>${item.text.replace(/</g, "&lt;")}</s>` : item.text.replace(/</g, "&lt;")}</span>${flags.length ? `<div class="flags">${flagsHtml(flags)}</div>` : ""}<div class="opts">${opts || '<p class="grp">No options came back for this one.</p>'}</div></div>`;
      })
      .join("");
    $(".rw-n").textContent = rwBusy ? "writing…" : "";
    if (words && picked) {
      $(".sel-name").textContent = `Selected: “${words.slice(0, 40)}${words.length > 40 ? "…" : ""}”`;
      $(".now").innerHTML = flagsHtml(slopIn(words, isHeading(picked), names));
      const mine = rwFor === picked;
      const used = edit?.newText;
      $(".opts").innerHTML = mine
        ? rwOptions
            .map((o, i) => {
              const found = slopIn(o.text, isHeading(picked!), names);
              return `<button class="opt${used === o.text ? " used" : ""}" data-opt="${i}"><b>${o.text.replace(/</g, "&lt;")}</b>${o.why ? `<i>${o.why.replace(/</g, "&lt;")}</i>` : ""}${found.length ? `<span class="flags">${flagsHtml(found)}</span>` : ""}</button>`;
            })
            .join("")
        : "";
      const diag = $(".sel-diag");
      diag.hidden = !(mine && rwDiag);
      diag.innerHTML = mine && rwDiag ? `${rwDiag.replace(/</g, "&lt;")} <span class="via">${rwVia ? `· ${rwVia}` : ""}</span>` : "";
      $(".more").hidden = !(mine && rwOptions.length);
      $("[data-act=rewrite-more]").toggleAttribute("disabled", !!rwBusy);
    }
    $("[data-act=text]").textContent = editing ? "✓ Done typing" : "✎ Edit text";
    $("[data-act=text-reset]").toggleAttribute("disabled", !edit || edit.html == null);
    bar.classList.toggle("on", selecting);
    $("[data-act=mode]").setAttribute("aria-pressed", String(selecting));
    if (picked) {
      const cs = getComputedStyle(picked);
      const text = textOf(picked);
      $(".who").innerHTML = `${nameOf(picked)}<i>${text ? `“${text.replace(/</g, "&lt;")}”` : `${Math.round(picked.getBoundingClientRect().width)} × ${Math.round(picked.getBoundingClientRect().height)}`}</i>`;
      pickBox.querySelector(".tag")!.textContent = nameOf(picked);
      const px = parseFloat(cs.fontSize);
      ($(".size") as HTMLInputElement).value = String(Math.round(px * 10) / 10);
      $(".fs").textContent = edit?.fontSize != null ? `was ${edit.was.fontSize}` : "";
      types.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === edit?.type)));
      const current = (target === "color" ? edit?.color : edit?.fill) ?? rgbToHex(target === "color" ? cs.color : cs.backgroundColor);
      ($(".hex") as HTMLInputElement).value = current;
      if (/^#[0-9a-f]{6}$/i.test(current)) ($(".picker") as HTMLInputElement).value = current;
      root.querySelectorAll<HTMLElement>("[data-colour]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.colour!.toLowerCase() === current.toLowerCase())));
      const scale = Math.round((edit?.scale ?? 1) * 100);
      ($(".scale") as HTMLInputElement).value = String(scale);
      $(".pct").textContent = `${scale}%`;
      $("[data-act=child]").toggleAttribute("disabled", !picked.firstElementChild);
      $("[data-act=parent]").toggleAttribute("disabled", !picked.parentElement || picked.parentElement === document.body);
    }
    root.querySelectorAll<HTMLElement>("[data-target]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.target === target)));
    $(".count").textContent = String(edits.length);
    $(".list").innerHTML = edits
      .map((e, i) => {
        const what = [e.removed && "removed", e.newText != null && `text “${e.newText.slice(0, 26).replace(/</g, "&lt;")}”`, e.type && TYPE[e.type]?.label, e.fontSize != null && `${e.fontSize}px`, e.color && `text ${e.color}`, e.fill && `fill ${e.fill}`, e.scale != null && e.scale !== 1 && `${Math.round(e.scale * 100)}%`].filter(Boolean).join(", ");
        return `<div><span data-go="${i}" title="${e.selector}">${e.tag}${e.text ? ` “${e.text.slice(0, 22).replace(/</g, "&lt;")}”` : ""} <em>${what}</em></span><button class="ghost" data-revert="${i}" title="Revert this change">✕</button></div>`;
      })
      .join("");
    $("[data-act=undo]").toggleAttribute("disabled", history.length < 2 && !edits.length);
    place(pickBox, picked);
  }

  const pick = (el: Element | null) => {
    if (el && !ours(el) && !inScope(el)) say("Only the part of the page that comes from your code can be edited here.", true);
    picked = el && !ours(el) && inScope(el) && el !== document.body && el !== document.documentElement ? el : null;
    render();
  };

  const setSize = (px: number) => change((e) => (e.fontSize = Math.max(6, Math.round(px * 2) / 2)));
  const setScale = (scale: number) => change((e) => (e.scale = Math.min(2.5, Math.max(0.3, Math.round(scale * 100) / 100))));
  const setColour = (hex: string) => change((e) => (target === "color" ? (e.color = hex) : (e.fill = hex)));
  const remove = () => {
    if (!picked) return;
    const parent = picked.parentElement;
    change((e) => (e.removed = true));
    say("Removed. Revert it from Changes, or ⌘Z.");
    pick(parent && parent !== document.body ? parent : null);
  };

  // Saving sends the edits to Claude (the dev server writes them to a file Claude is watching).
  // When Claude has written them into the code, the live edits are dropped and the page reloads.
  const sentKey = `${prefix}:sent:${page}`;
  let poll = 0;
  const waitForClaude = () => {
    window.clearInterval(poll);
    poll = window.setInterval(async () => {
      let sent: { at: string; edits: string } | null = null;
      try {
        sent = JSON.parse(localStorage.getItem(sentKey) ?? "null");
      } catch {
        sent = null;
      }
      if (!sent) return window.clearInterval(poll);
      try {
        const res = await fetch(`${endpoint}/edits?page=${encodeURIComponent(page)}`);
        const { applied } = (await res.json()) as { applied: string | null };
        if (applied !== sent.at) return;
        window.clearInterval(poll);
        localStorage.removeItem(sentKey);
        if (JSON.stringify(edits) === sent.edits) {
          localStorage.removeItem(storeKey);
          if (live) {
            // A published page: load it fresh past the site's cache. Click the bookmark again to keep editing.
            const url = new URL(location.href);
            url.searchParams.set("v", Date.now().toString(36));
            location.replace(url.toString());
          } else location.reload();
        } else say("Claude applied your last save. You have changed more since: press Reset all if the page looks doubled, then carry on.", true);
      } catch {
        /* dev server restarting: try again */
      }
    }, 2000);
  };

  const send = async () => {
    const data = payload();
    const body = JSON.stringify(data, null, 2);
    try {
      const res = await fetch(`${endpoint}/edits`, { method: "POST", headers: { "content-type": "application/json" }, body });
      if (!res.ok) throw new Error(String(res.status));
      localStorage.setItem(sentKey, JSON.stringify({ at: data.savedAt, edits: JSON.stringify(edits) }));
      say(
        live
          ? `Saved ${edits.length} change${edits.length === 1 ? "" : "s"} and sent to Claude. The page reloads once they're published (a few minutes).`
          : `Saved ${edits.length} change${edits.length === 1 ? "" : "s"} and sent to Claude. The page reloads when they are in the code.`,
      );
      waitForClaude();
    } catch {
      try {
        await navigator.clipboard.writeText(body);
        say(`Couldn't reach the ${live ? "page editor helper" : "dev server"}, so the changes are on your clipboard. Paste them to Claude.`, true);
      } catch {
        say(live ? "Couldn't save or copy. Is the page editor helper running on your Mac?" : "Couldn't save or copy. Is the dev server running?", true);
      }
    }
  };

  // While typing, toolbar buttons must not steal focus (the blur would end the typing before the click lands).
  bar.addEventListener("mousedown", (event) => {
    if (editing && (event.target as HTMLElement).closest("button, [data-go]")) event.preventDefault();
  });
  bar.addEventListener("click", (event) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>("button, [data-go], [data-goto], [data-tgo]");
    if (!el) return;
    const act = el.dataset.act;
    const wasTyping = !!editing;
    if (editing) stopTyping(true);
    if (el.dataset.foldbtn) {
      const key = el.dataset.foldbtn;
      open = open.includes(key) ? open.filter((k) => k !== key) : [...open, key];
      try {
        localStorage.setItem(foldKey, JSON.stringify(open));
      } catch {
        /* private mode */
      }
      render();
    } else if (el.dataset.chip) {
      const chip = el.dataset.chip;
      mood.picks = mood.picks.includes(chip) ? mood.picks.filter((c) => c !== chip) : [...mood.picks, chip];
      saveMood();
      render();
    } else if (el.dataset.opt) useOption(Number(el.dataset.opt));
    else if (el.dataset.popt) usePassOption(el.dataset.popt);
    else if (el.dataset.goto) {
      const found = find(passItems[Number(el.dataset.goto)]?.selector ?? "");
      if (found) {
        found.scrollIntoView({ block: "center", behavior: "smooth" });
        pick(found);
      }
    } else if (act === "pass") headingsPass();
    else if (act === "again") {
      if (lastRun === "blocks") {
        const els = passItems.map((it) => find(it.selector)).filter((x): x is Element => !!x);
        void runSet(els, "blocks");
      } else headingsPass();
    } else if (act === "target") setTargeting(!targeting);
    else if (act === "target-go") void runSet(targets, "blocks");
    else if (act === "target-clear") {
      targets = [];
      render();
    } else if (el.dataset.tdrop) {
      targets.splice(Number(el.dataset.tdrop), 1);
      render();
    } else if (el.dataset.tgo) {
      targets[Number(el.dataset.tgo)]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    else if (act === "pass-clear") {
      passItems = [];
      passDiag = "";
      render();
    }
    else if (act === "rewrite") void rewrite(false);
    else if (act === "rewrite-more") void rewrite(true);
    else if (act === "rewrite-clear") {
      rwOptions = [];
      rwAsked = [];
      rwDiag = "";
      render();
    } else if (el.dataset.type) change((e) => (e.type = e.type === el.dataset.type ? undefined : el.dataset.type));
    else if (el.dataset.colour) setColour(el.dataset.colour);
    else if (el.dataset.target) {
      target = el.dataset.target as typeof target;
      render();
    } else if (el.dataset.revert) {
      edits.splice(Number(el.dataset.revert), 1);
      commit();
    } else if (el.dataset.go) {
      const edit = edits[Number(el.dataset.go)];
      const found = edit && !edit.removed ? find(edit.selector) : null;
      if (found) {
        found.scrollIntoView({ block: "center", behavior: "smooth" });
        pick(found);
      } else say("That one is removed. Use ✕ to bring it back.");
    } else if (act === "mode") {
      selecting = !selecting;
      if (selecting) targeting = false;
      hovered = null;
      place(hoverBox, null);
      render();
    } else if (act === "fold") {
      bar.classList.toggle("small");
      el.textContent = bar.classList.contains("small") ? "▸" : "▾";
    } else if (act === "parent") pick(picked?.parentElement ?? null);
    else if (act === "child") pick(picked?.firstElementChild ?? null);
    else if (act === "remove") remove();
    else if (act === "text") {
      if (!wasTyping) startTyping();
    } else if (act === "text-reset") change((e) => (e.html = e.newText = undefined));
    else if (act === "smaller" && picked) setSize(parseFloat(getComputedStyle(picked).fontSize) / 1.08);
    else if (act === "bigger" && picked) setSize(parseFloat(getComputedStyle(picked).fontSize) * 1.08);
    else if (act === "size-reset") change((e) => (e.fontSize = undefined));
    else if (act === "colour-reset") change((e) => (target === "color" ? (e.color = undefined) : (e.fill = undefined)));
    else if (act === "shrink") setScale((editFor(picked!, false)?.scale ?? 1) - 0.05);
    else if (act === "grow") setScale((editFor(picked!, false)?.scale ?? 1) + 0.05);
    else if (act === "scale-reset") change((e) => (e.scale = undefined));
    else if (act === "undo") undo();
    else if (act === "reset-all") {
      if (edits.length && window.confirm(`Throw away all ${edits.length} changes on this page?`)) {
        edits = [];
        commit();
        say("All changes cleared.");
      }
    } else if (act === "copy") void navigator.clipboard.writeText(JSON.stringify(payload(), null, 2)).then(() => say("Copied. Paste it to Claude."), () => say("Couldn't copy.", true));
    else if (act === "send") void send();
  });
  $(".size").addEventListener("change", (event) => setSize(Number((event.target as HTMLInputElement).value)));
  $(".scale").addEventListener("input", (event) => {
    if (!picked) return;
    const edit = editFor(picked, true)!;
    edit.scale = Number((event.target as HTMLInputElement).value) / 100;
    sheet.textContent = rules();
    $(".pct").textContent = `${Math.round(edit.scale * 100)}%`;
    place(pickBox, picked);
  });
  $(".scale").addEventListener("change", () => commit());
  $(".picker").addEventListener("input", (event) => {
    if (!picked) return;
    const edit = editFor(picked, true)!;
    const hex = (event.target as HTMLInputElement).value.toUpperCase();
    if (target === "color") edit.color = hex;
    else edit.fill = hex;
    sheet.textContent = rules();
    ($(".hex") as HTMLInputElement).value = hex;
  });
  $(".picker").addEventListener("change", () => commit());
  $(".hex").addEventListener("change", (event) => {
    const value = (event.target as HTMLInputElement).value.trim();
    if (/^#?[0-9a-f]{3,8}$/i.test(value)) setColour(value.startsWith("#") ? value.toUpperCase() : `#${value.toUpperCase()}`);
    else say("That isn't a hex colour.", true);
  });

  // Drag the toolbar by its header.
  const head = $(".head");
  head.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const r = bar.getBoundingClientRect();
    const dx = event.clientX - r.left;
    const dy = event.clientY - r.top;
    head.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      bar.style.left = `${Math.min(window.innerWidth - 60, Math.max(-r.width + 80, e.clientX - dx))}px`;
      bar.style.top = `${Math.min(window.innerHeight - 40, Math.max(0, e.clientY - dy))}px`;
      bar.style.right = "auto";
    };
    const up = () => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
  });

  // ---- picking on the page (capture phase, so the page's own handlers never see it)

  const swallow = (event: Event) => {
    const at = hit(event);
    if (!(selecting || targeting) || ours(event.target) || ours(at)) return false;
    if (editing && at && editing.contains(at)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
  };
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart"] as const) {
    document.addEventListener(type, swallow, { capture: true, passive: false });
  }
  document.addEventListener(
    "click",
    (event) => {
      if (!swallow(event)) return;
      if (editing) stopTyping(true);
      if (targeting) toggleTarget(blockOf(hit(event)));
      else pick(hit(event));
    },
    true,
  );
  // Double-click something with words in it to type into it.
  document.addEventListener(
    "dblclick",
    (event) => {
      if (!swallow(event) || targeting) return;
      pick(hit(event));
      startTyping({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY });
    },
    true,
  );
  // Paste words only, never someone else's formatting.
  document.addEventListener(
    "paste",
    (event) => {
      const at = hit(event);
      if (!editing || !at || !editing.contains(at)) return;
      event.preventDefault();
      document.execCommand("insertText", false, event.clipboardData?.getData("text/plain") ?? "");
    },
    true,
  );
  document.addEventListener(
    "focusout",
    (event) => {
      if (editing && hit(event) === editing) stopTyping(true);
    },
    true,
  );
  document.addEventListener(
    "mousemove",
    (event) => {
      if (!(selecting || targeting) || ours(event.target) || ours(hit(event))) {
        if (hovered) {
          hovered = null;
          place(hoverBox, null);
        }
        return;
      }
      const at = hit(event);
      hovered = targeting ? blockOf(at) : at && inScope(at) ? at : null;
      hoverBox.classList.toggle("t", targeting);
      place(hoverBox, hovered === picked || (hovered && targets.includes(hovered)) ? null : hovered);
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      const key = event.key;
      if (editing) {
        if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "s") {
          event.preventDefault();
          stopTyping(true);
          void send();
        } else if (key === "Escape") {
          event.preventDefault();
          stopTyping(false);
        } else if (key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          stopTyping(true);
        }
        event.stopPropagation(); // the page's own shortcuts stay out of the way while typing
        return;
      }
      const typing = event.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || (n instanceof HTMLElement && n.isContentEditable));
      if (typing) return;
      let used = true;
      if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "z") undo();
      else if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "s") void send();
      else if (event.metaKey || event.ctrlKey || event.altKey) used = false;
      else if (key.toLowerCase() === "b") setTargeting(!targeting);
      else if (key === "Escape" && targeting) setTargeting(false);
      else if (key.toLowerCase() === "e") {
        selecting = !selecting;
        if (selecting) targeting = false;
        place(hoverBox, null);
        render();
      } else if (key.toLowerCase() === "g") document.documentElement.classList.toggle("show-grid");
      else if (!selecting) used = false;
      else if (key === "Escape") pick(null);
      else if (key.toLowerCase() === "t" && picked) startTyping();
      else if (key.toLowerCase() === "r" && picked) void rewrite(false);
      else if (key === "ArrowUp" && picked) pick(picked.parentElement);
      else if (key === "ArrowDown" && picked?.firstElementChild) pick(picked.firstElementChild);
      else if ((key === "Delete" || key === "Backspace") && picked) remove();
      else used = false;
      if (used) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  const follow = () => {
    place(pickBox, picked);
    if (targets.length) drawMarks();
    if (hovered) place(hoverBox, hovered === picked ? null : hovered);
  };
  window.addEventListener("scroll", follow, { passive: true, capture: true });
  window.addEventListener("resize", follow);

  // On a narrow window it starts folded to a small pill, out of the page's way.
  if (window.innerWidth < 900) {
    bar.classList.add("small");
    $("[data-act=fold]").textContent = "▸";
  }
  history = [JSON.stringify(edits)];
  commit(false);
  if (localStorage.getItem(sentKey)) waitForClaude();
  if (edits.length) say(`${edits.length} saved change${edits.length === 1 ? "" : "s"} re-applied.`);
}
