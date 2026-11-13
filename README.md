# Web Tools

Tools for editing web pages live in the browser while you build them, so the design and the
words can be worked on where they'll be seen, not in an editor or a chat window.

| Tool | What it does |
|---|---|
| [`page-editor`](#page-editor) | A floating toolbar on any page in development. Pick something, then remove, resize, restyle, recolour or retype it, or have Claude rewrite its words. Save hands the edits to Claude to make permanent in the code. |

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
- **Text size**, **Type style**, **Colour** (text or fill), **Shrink / grow**.
- **Edit text**: double-click words (or `T`) and type. `Enter` keeps it, `⇧Enter` adds a line
  break, `Esc` cancels, **Original text** puts it back.
- **Rewrite with AI** (the orange box). Describe the mood and/or tap quick picks, then:
  - **✦ All headings** rewrites every heading that reads as AI as one set, three options each,
    so they don't all follow one formula. Click an option under each heading to use it.
  - **✦ Selected** (or `R`) rewrites what you picked, five options; **More, different** asks
    for five more.
  - Headings, selections and every option are checked on the spot for patterns that make copy
    read as machine-written: template headings ("Meet X", "Built for X"), -ing headings,
    "X, not Y" slogans, clipped fragments, empty words, em dashes, Title Case.
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
