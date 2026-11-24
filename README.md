# Web Tools

Tools for editing web pages live in the browser while you build them, so the design and the
words can be worked on where they'll be seen, not in an editor or a chat window.

| Tool | What it does |
|---|---|
| [`page-editor`](#page-editor) | A floating toolbar on any page in development. Pick something, then remove, resize, restyle, recolour or retype it, or have Claude rewrite its words. Save hands the edits to Claude to make permanent in the code. |
| [`live-editor`](#live-editor) | The same toolbar on a published site, opened by a bookmark that only works for you. Save hands the edits to Claude to make permanent and publish. |

## Try it

```bash
npm install
npm run demo
```

Then open <http://localhost:5190>. The demo page's headings are written the way readers have
learned to distrust ("Meet Lumen", "Light, reimagined", "Built for efficiency"): click
**✦ All headings** in the toolbar's orange box.

`npm test` checks the AI-pattern rules; `npm run typecheck` checks the types.

## Page editor

Two halves:

- **`page-editor/editor.ts`**: the toolbar. Runs in the page.
- **`page-editor/vite-plugin.mjs`**: the dev-server half. Receives saves and talks to Claude.
  Dev only (`apply: "serve"`), so none of it reaches a build.

### Add it to a Vite project

```ts
// vite.config.ts
import { pageEditor } from "../Web-Tools/page-editor/vite-plugin.mjs";

export default defineConfig({
  plugins: [
    pageEditor({
      facts: ["src/content.ts"],   // where the page's real facts and numbers live
      brief: "page-brief.md",      // optional: your copy of briefs/default.md
      editsDir: "page-edits",      // add this folder to .gitignore
    }),
  ],
  // Web-Tools sits outside your project, so let the dev server read it:
  server: { fs: { allow: [".", "../Web-Tools"] } },
});
```

```ts
// somewhere that only runs in development
if (import.meta.env.DEV) {
  import("../Web-Tools/page-editor/editor").then(({ mountEditor }) =>
    mountEditor({ page: "home", names: ["Lumen"] }),
  );
}
```

`mountEditor` options:

| Option | What it's for |
|---|---|
| `page` | Short id for the page; edits are stored and saved under it. |
| `types` | The Type style buttons (H1–H4, Body…): `{ key: { label, hint, css } }`. Default: a plain system-font set. |
| `swatches` | Colour quick picks: `[{ group, colours: [[name, hex], …] }]`. |
| `names` | Proper nouns the AI-pattern check may see capitalised. |
| `endpoint` | Must match the plugin's `endpoint` (default `/__page-editor`). |
| `storagePrefix` | Prefix for what the browser remembers (edits, mood). |
| `sourceRoot` | Trimmed from source paths in saves, e.g. your project folder. |

Plugin options: `facts`, `brief`, `editsDir`, `endpoint`, `model` (default `claude-opus-5-5`,
or `PAGE_EDITOR_MODEL`), `effort` (`medium`), `sessionFallback` (`true`).

`page-editor/presets/keefedesign.ts` has keefedesign.com's type system and the Coco
project's colours; `presets/keefedesign-brief.md` is the Coco case study's brief.

### Using the toolbar

- **Select** (or `E`), then click anything. `↑` `↓` step out and in. `Delete` removes.
- **Style**: text size, type style, colour (text or fill), shrink / grow.
- **Edit text**: double-click words (or `T`) and type. `Enter` keeps it, `⇧Enter` adds a line
  break, `Esc` cancels, **Original text** puts it back.
- **Rewrite with AI** (the orange box). Open **Mood** to describe the mood and/or tap quick
  picks (the line shows what's set while folded), then choose what to rewrite:
  - **◎ Pick blocks** (or `B`): click any text on the page (a paragraph, heading, list item,
    quote or label) to add it; each gets a numbered marker, click again to drop it. Then
    **✦ Rewrite this block** gives five options, or **✦ Rewrite these N** gives three for each,
    written as a set. Paragraphs stay paragraphs and keep their facts unless you pick Shorter.
  - **✦ All headings** rewrites every heading that reads as AI as one set, three options each,
    so they don't all follow one formula.
  - With an element chosen in **Select** mode, **✦ Write 5 options** (or `R`) rewrites it;
    **More, different** asks for five more.
  - Click an option to put it on the page; **Again** asks for fresh ones. Headings, chosen text
    and every option are checked on the spot for patterns that make copy read as
    machine-written: template headings ("Meet X", "Built for X"), -ing headings, "X, not Y"
    slogans, clipped fragments, empty words, em dashes, Title Case.
- Sections fold: **Selected**, **Style** (size, type style, colour, scale), **Mood** and
  **Shortcuts** open with a click on their heading. Style, Mood and Shortcuts start folded;
  the toolbar remembers what you leave open.
- **Changes** lists every edit with ✕ to revert; `⌘Z` undoes. **Save** (`⌘S`) writes them to
  `<editsDir>/<page>.json` with each element's source file and line (React dev builds).

### How it reaches Claude

Rewrites go through **Claude Code** on your Mac (`claude -p`, no tools, structured output), using
your own Claude sign-in, so there's no API key to manage. One-time setup:

```bash
claude auth login
```

The default model needs Claude Code 2.1.280 or newer (`claude update`). A single rewrite takes
about 10 seconds; a headings pass about 15–20.

If Claude Code can't answer, the request is left in `<editsDir>` as
`rewrite-<id>.request.json` (with the full prompt and the JSON shape wanted) and the page waits
up to four minutes for `rewrite-<id>.answer.json`. An open Claude Code session that watches the
folder can answer it. Turn that off with `sessionFallback: false`.

### Saving into the code

Save only writes the edits to a file. Making them permanent is a job for Claude Code: with a
session open in the project, ask it to watch `<editsDir>` and apply each save. Each edit
carries a CSS selector, the JSX `file:line` (React dev builds), the values before, and for text
the old and new wording. When a save is applied, write `<page>.applied.json` containing that
save's `savedAt`; the page then drops its live edits and reloads.

### The writing rules

`page-editor/briefs/default.md` is what Claude is told, every time. Copy it, describe your
project at the top, and point `brief` at the copy. The instant check in `page-editor/slop.ts`
follows the same list; keep the two in step.

## Live editor

A second version of the page editor for a site that's already published, kept separate so
projects using the dev toolbar aren't affected. It's the same toolbar (Select, Style, Edit text,
Rewrite with AI, Pick blocks, Save), opened by a bookmark and backed by a helper on your Mac.

```bash
npm run live
```

Then open <http://127.0.0.1:5199> and drag **✎ Edit page** to Chrome's bookmarks bar. On any
page of the site, click it. The first time, Chrome asks whether the site may connect to
devices on your local network: allow it (that's the helper).

**Only you see it.** Nothing is added to the site. The toolbar loads only from your bookmark,
only while the helper runs on your Mac, and the keefedesign.com setup also refuses to open
unless you're signed in to the site's WordPress in that browser. The helper listens on
127.0.0.1 and answers saves and rewrites only from the site's own address.

| File | What it is |
|---|---|
| `live-editor/editor.ts` | The toolbar. Adds `scope` (edit only inside one element, or its shadow root, e.g. an embed) and live saving to the page editor's. |
| `live-editor/server.mjs` | The helper: serves the toolbar (bundled on each load), saves and rewrites. |
| `live-editor/core.mjs` | Saves and rewrites, as in the page editor, plus per-page briefs and facts. |
| `live-editor/sites/keefedesign.*` | keefedesign.com: the entry (`.ts`), the helper config (`.json`) and the site's rewrite brief. |

On keefedesign.com each page saves under an id from its address (`/project/coco` →
`project-coco`, `/` → `home`) to `live-editor/edits/keefedesign/<page>.json`. On the Coco case
study the toolbar edits inside the Coco embed and rewrites use that project's brief and facts;
elsewhere it edits the whole page.

Saves carry `"live": true` and no JSX source lines, so Claude matches them by text and
selector (inside a shadow root, selectors start with `:host >`). Claude makes the change where
it lives (the embed's source, rebuilt and re-uploaded, or the page's Semplice content), publishes
it, and only then writes `<page>.applied.json`. The page then reloads past the site's cache;
click the bookmark again to carry on.

To add another site, copy `sites/keefedesign.ts` and `.json`, change `origins` and the entry,
and run `node live-editor/server.mjs live-editor/sites/<site>.json`.

### Mibbit (local app)

Mibbit's dev server runs in Docker, where Claude Code can't reach your Mac, so it uses the live
editor's helper instead of the Vite plugin:

```bash
npm run mibbit
```

Or skip the steps: **Mibbit Tools** (in `~/Applications`, built by `launcher/make-app.sh`) starts
Docker and Mibbit if they're off, starts this helper if it isn't running, and opens
<http://localhost:5173/?tools> in Chrome. Keep it in the Dock; clicking it again just opens Chrome.
Its logs are in `~/Library/Logs/mibbit-tools/`; the helper it starts runs until you log out.

Then open <http://localhost:5173/?tools>. A small dock sits in the bottom-left corner: **✎ Edit**
(⌥E, the toolbar), **◐ Colour** (⌥C, Colour Lab), **✦ Design** (⌥D, Design Generator); its dot (⌥H)
hides every tool for a clean look at the app, with your changes still on. If the helper isn't
running, a note in that corner says so.

All three open in the same docked slot on the left, one at a time (opening one folds the
others). **⌘Z / ⌘⇧Z** undo and redo in the tool you last used (the toolbar's edits, the Colour
Lab's palette, the Design Generator's part, variations and choice); once you click the app itself,
they're the app's own undo and redo again. In a text field they undo your typing. The app's dev-only loader (`web/src/dev/designTools.ts`
in the Mibbit repo) pulls the toolbar from the helper and keeps it on in that browser;
`?tools=off` hides it. The Type style and colour buttons are Mibbit's own (fonts and tokens from
`web/src/styles/tokens.css`), rewrites follow `sites/mibbit-brief.md` (Mibbit's voice), and saves go
to `live-editor/edits/mibbit/<page>.json`. Mibbit is React 19, which no longer records JSX lines,
so each saved edit names its file when React kept it (compiled line, marked `~`) and always the
components it sits in, e.g. `in TrackTab < CanvasRow2 < SongCanvas`.

#### Colour Lab (Mibbit)

**◐ Colour** in the dock (⌥C) opens a palette lab on the running app. Pick a seed colour
(or a quick pick, or the Hue / Chroma / Lightness sliders) and the brand's whole 13-step scale is
re-derived from it in OKLCH: the seed lands exactly on step 800 and the other steps keep the
current scale's shape. The casing (neutral) scale can turn with the brand's hue and its tint can go
from pure grey to three times as colourful; the two supporting scales follow a harmony. The app
recolours live, because the lab overrides the scale variables on `:root`.

- **Theme** decides how much of the page follows: **Whole page** turns on Casing (surfaces and text
  lean toward the brand's hue), Displays (scope glass, LCD, OLED), Accents (scope cyan, spectrum
  green, LCD phosphor, gold, the Nibbit character) and Tracks (the 16 track colours, turned as one
  wheel so they stay distinct). **Brand only** goes back to the brand and the casing's hue. Sliders
  set how far the casing and displays lean in, and how vivid accents and tracks are (muted to
  neon). Error, warning, success and info never move: they carry meaning. Canvases (waveforms,
  the analyzer) redraw in the theme as it changes: the lab fires `palettechange` and Mibbit's
  canvases re-read their colours (`onPaletteChange` in its `resolvedPalette.ts`); on a reload the
  theme is put on before the first frame.
- **Contrast** checks every role pairing from Mibbit's `scripts/palette-contrast.py` live; click it
  for the list, failures first.
- **Original** (click, or hold O) flips back to the app's own colours to compare.
- **Ask Claude** turns a mood into three palettes; click one to try it.
- **Keep** names the current palette for later; **Put it in the app** writes it into
  `web/src/styles/tokens.css` (see Putting saves into the code below), keeping a record in
  `live-editor/edits/mibbit/palette-<name>.json` (every changed step, the old values, the contrast
  result, and the places that paint the brand with fixed colours).
- The mascot orb paints with fixed colours, so the lab previews it with a hue filter; the save
  lists it (and the other fixed crimsons) as needing a code change.

Code: `live-editor/colour/palette.ts` (the maths, tested in `test/palette.test.ts`),
`live-editor/colour/lab.ts` (the panel), `live-editor/sites/mibbit-palette.ts` (Mibbit's scales and
pairings) and `sites/mibbit-palette-brief.md` (what Claude is told).

#### Design Generator (Mibbit)

**✦ Design** in the dock (⌥D) makes new designs for one part of the app,
tried in place. **◎ Pick a part** and click anything (↑ ↓ while picking, or **Bigger** /
**Smaller**, change how much of it you take); choose **Every one like it** (every element with that
class, e.g. all 16 pattern chips) or **Just this one**. Say what to try (or tap a quick pick) and
**✦ Make 3 variations**: Claude gets the part's markup, computed styles, the app's own CSS rules for
it, the app's role tokens and Mibbit's OP-1 design-language guide, and writes three CSS-only
variations (about 30–60 seconds). The first goes on the app at once; click a card to switch,
**Original** (or hold O) to compare, **More** for three in other directions. The app keeps working:
markup, words and behaviour are untouched.

**▣ Whole app** designs everything at once: Claude sees the 40 most-used parts on screen and the
role tokens, and its variations restyle the shared tokens (corners, shadows, surfaces, type) and
those parts. Colour roles stay single palette steps (the Colour Lab owns colour, and the contrast
check reads only that).

**Inspiration**: drop, paste (⌘V) or choose up to four images. They're kept by the helper
(`live-editor/edits/<site>/inspiration/`) and Claude looks at each one when it designs (Claude Code
gets the Read tool for that folder only), saying in each variation which image it draws on.

**Keep** remembers a variation (with its part) for later; **Put it in the app** has Claude write it
into the component's stylesheet (see Putting saves into the code below), keeping a record in
`live-editor/edits/mibbit/design-<name>.json` (the part, its component chain, the request and the CSS). Parts drawn on a canvas say so: CSS can
change their frame, not what's drawn.

Code: `live-editor/design/generator.ts`, `sites/mibbit-design.ts` (quick picks, which tokens) and
`sites/mibbit-design-brief.md` plus the design facts in `mibbit.json` (what Claude is told).

#### Putting saves into the code (Mibbit)

With `"apply"` in a site's config, saves don't wait for someone to pick them up: the helper writes
them into the project on its branch (`color-edits` for Mibbit), one commit per save.

| Save | How it gets into the code |
|---|---|
| Colour Lab, **Put it in the app** | No AI: the changed scale steps and accent colours are written into `web/src/styles/tokens.css`; a themed track wheel also updates its copy in `web/src/engine/padColors.ts` and the test that pins track 1, and that test must pass. `scripts/palette-contrast.py` re-runs (a failing pairing refuses the palette) and its table in `docs/research/` is regenerated. Any failure puts every file back. |
| Design Generator, **Put it in the app** | Claude Code writes the variation into the component's stylesheet, replacing what it overrides (CSS files under `web/src/styles/` only). A whole-app design may also change roles in `tokens.css`; the contrast check then runs, and a failure goes back to Claude to adjust (twice at most) before it's dropped. |
| Toolbar, **Save** | Claude Code writes the text and style edits into the code (`web/src/` only); the toolbar reloads when they're in. |

Claude Code runs headless in restricted mode: Read, Edit, Grep and Glob only, confined to the
project, no shell, no settings, no MCP servers, your own sign-in (never an API key). The helper
then checks only allowed files changed, type-checks when code (not just CSS) changed, and commits;
anything else is put back with the reason shown in the panel. It refuses to start unless the
project is on its branch with no uncommitted changes, and runs one apply at a time.

**Undo** (in each panel, after an apply) reverts that commit; it only reverts commits the helper
made (`live-editor/edits/<site>/applied-log.json`). The app's dev server may reload the page the
moment the code changes; the panels note an apply before starting and pick up its result after
the reload.

Code: `live-editor/apply.mjs` (the applies, guards and Undo), `live-editor/applied.ts` (the
panels' Apply / Undo).

#### Staying out of the app's way

Folded tools cost nothing while the app runs: the toolbar only watches the page for redraws while
it has text edits to keep in place, and the Design Generator only tracks its outline while open.
Measured on Mibbit playing a beat (10 s, browser pane): 0 ms of long tasks with the tools loaded
and folded, the same as without them (191 ms before this change). `mountDock` (`live-editor/dock.ts`)
replaces the panels' own pills (`launcher: false`); without a dock each panel shows its pill.
