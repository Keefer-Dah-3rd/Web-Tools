/**
 * Mibbit (the local app, http://localhost:5173) in the live editor.
 *
 * Mibbit's dev server runs in Docker, where Claude Code can't reach your Mac, so this helper does
 * the Claude half instead: npm run mibbit. The app's dev-only loader (web/src/dev/designTools.ts)
 * pulls the toolbar from here when you open the app with ?tools.
 *
 * Mibbit is one screen with panels and dialogs, so most edits save under "studio". Other routes
 * (#/u/…, #/s/…, /admin) save under their own id.
 *
 * Source paths in saves are relative to the repo's web/ folder (React 19 gives a compiled line, marked ~).
 */
import { mountEditor } from "../editor";
import { MIBBIT_NAMES, MIBBIT_TYPES, mibbitSwatches } from "../../page-editor/presets/mibbit";
import { mountColourLab } from "../colour/lab";
import { mountDesignGenerator } from "../design/generator";
import { mountTextureLab } from "../texture/lab";
import { mountDock } from "../dock";
import { MIBBIT_RULES } from "./mibbit-rules";
import { MIBBIT_DESIGN } from "./mibbit-design";
import { MIBBIT_PALETTE } from "./mibbit-palette";

const route = (location.hash.replace(/^#\/?/, "") || location.pathname.replace(/^\/+/, ""))
  .split(/[/?]/)[0]
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .slice(0, 40);

mountEditor({
  rules: MIBBIT_RULES,
  page: route || "studio",
  types: MIBBIT_TYPES,
  swatches: mibbitSwatches(),
  names: MIBBIT_NAMES,
  storagePrefix: "mibbit-tools",
});

// The Colour Lab: regenerate the brand and casing scales live (bottom-left pill).
const colour = mountColourLab({
  rules: MIBBIT_RULES,
  launcher: false,
  site: MIBBIT_PALETTE,
  endpoint: window.__pageEditorLive?.endpoint ?? "http://127.0.0.1:5198/__page-editor",
  storagePrefix: "mibbit-tools",
});

// The Design Generator: three CSS variations of a picked part, tried in place (pill above Colour Lab).
const design = mountDesignGenerator({
  rules: MIBBIT_RULES,
  launcher: false,
  site: MIBBIT_DESIGN,
  endpoint: window.__pageEditorLive?.endpoint ?? "http://127.0.0.1:5198/__page-editor",
  storagePrefix: "mibbit-tools",
});

// The Texture Lab: swap the gloss and skeuomorphic finish for another material, across the app.
const texture = mountTextureLab({
  rules: MIBBIT_RULES,
  launcher: false,
  site: {
    inks: { light: "--warm-50", dark: "--warm-999" },
    asks: [
      "Worn rubber, no shine",
      "Bead-blasted aluminium",
      "Chalky matte plastic",
      "Frosted translucent case",
      "Old Braun hi-fi",
      "Risograph print",
      "Anodised, but calmer",
      "Like the OP-1's screen art",
    ],
  },
  endpoint: window.__pageEditorLive?.endpoint ?? "http://127.0.0.1:5198/__page-editor",
  storagePrefix: "mibbit-tools",
});

// One launcher in Mibbit's bottom bar (empty on the left) instead of floating pills; ⌥E ⌥C ⌥D ⌥T, ⌥H hides all.
mountDock({
  storagePrefix: "mibbit-tools",
  // Side by side, these full-window rules (width: 100vw) size to the app's half instead.
  viewportWide: [".app-shell", ".prompt-bar--oled"],
  tools: [
    ...(colour ? [{ label: "Colour", icon: "◐", code: "KeyC", host: "colour-lab", control: colour }] : []),
    ...(design ? [{ label: "Design", icon: "✦", code: "KeyD", host: "design-generator", control: design }] : []),
    ...(texture ? [{ label: "Texture", icon: "◍", code: "KeyT", host: "texture-lab", control: texture }] : []),
  ],
});
