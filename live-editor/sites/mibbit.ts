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
import { mountDock } from "../dock";
import { MIBBIT_DESIGN } from "./mibbit-design";
import { MIBBIT_PALETTE } from "./mibbit-palette";

const route = (location.hash.replace(/^#\/?/, "") || location.pathname.replace(/^\/+/, ""))
  .split(/[/?]/)[0]
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .slice(0, 40);

mountEditor({
  page: route || "studio",
  types: MIBBIT_TYPES,
  swatches: mibbitSwatches(),
  names: MIBBIT_NAMES,
  storagePrefix: "mibbit-tools",
});

// The Colour Lab: regenerate the brand and casing scales live (bottom-left pill).
const colour = mountColourLab({
  launcher: false,
  site: MIBBIT_PALETTE,
  endpoint: window.__pageEditorLive?.endpoint ?? "http://127.0.0.1:5198/__page-editor",
  storagePrefix: "mibbit-tools",
});

// The Design Generator: three CSS variations of a picked part, tried in place (pill above Colour Lab).
const design = mountDesignGenerator({
  launcher: false,
  site: MIBBIT_DESIGN,
  endpoint: window.__pageEditorLive?.endpoint ?? "http://127.0.0.1:5198/__page-editor",
  storagePrefix: "mibbit-tools",
});

// One launcher in Mibbit's bottom bar (empty on the left) instead of floating pills; ⌥E ⌥C ⌥D, ⌥H hides all.
mountDock({
  storagePrefix: "mibbit-tools",
  tools: [
    ...(colour ? [{ label: "Colour", icon: "◐", code: "KeyC", host: "colour-lab", control: colour }] : []),
    ...(design ? [{ label: "Design", icon: "✦", code: "KeyD", host: "design-generator", control: design }] : []),
  ],
});
