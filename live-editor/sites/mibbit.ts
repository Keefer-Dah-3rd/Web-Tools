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
import { mountTypeLab } from "../type/lab";
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

// The Type Lab: any Google web font per role, sized and weighted, kept as named type styles.
const D = "--font-display", M = "--font-mono", S = "--font-sans", B = "--font-bitmap", L = "--font-lcd";
const type = mountTypeLab({
  rules: MIBBIT_RULES,
  launcher: false,
  site: {
    appName: "Mibbit",
    roles: [
      { token: D, label: "Display", sample: "KICK 01 · SWING 54", hint: "Titles, tabs, pad names and caps labels" },
      { token: M, label: "Interface", sample: "Pads  Steps  Mixer  128 BPM", hint: "Most of the UI: controls, values, menus" },
      { token: S, label: "Text", sample: "Describe a sound and Mibbit makes it.", hint: "Sentences: prompts, help, dialogs" },
      { token: B, label: "Readouts", sample: "120.0  01.03.04", hint: "BPM and transport readouts" },
      { token: L, label: "LCD digits", sample: "88:88  128", hint: "Seven-segment displays" },
    ],
    tracking: ["--tracking-caps", "--tracking-caps-wide"],
    asks: [
      "70s Japanese synth manual",
      "Braun calculator, very calm",
      "Rave flyer, loud and condensed",
      "Old Macintosh, friendly pixels",
      "Swiss poster, strict grid",
      "Lab equipment, engraved panels",
      "Softer and rounder for beginners",
      "Like Teenage Engineering, but warmer",
    ],
    presets: [
      { id: "p-swiss", name: "Swiss hardware", why: "Clean grotesk labels over a plain mono, like a Braun or Dieter Rams panel.", roles: { [D]: { family: "Space Grotesk", size: 104, weight: 100 }, [M]: { family: "IBM Plex Mono" }, [S]: { family: "Inter Tight" } }, tracking: 0.8 },
      { id: "p-terminal", name: "Terminal", why: "A phosphor terminal: VT323 for the big type, JetBrains Mono for the rest.", roles: { [D]: { family: "VT323", size: 128 }, [M]: { family: "JetBrains Mono", size: 96 }, [B]: { family: "VT323", size: 120 } } },
      { id: "p-instrument", name: "Instrument panel", why: "Wide, engraved-looking caps (Michroma) with a soft mono, like lab test gear.", roles: { [D]: { family: "Michroma", size: 86 }, [M]: { family: "DM Mono" }, [S]: { family: "DM Sans" } }, tracking: 1.3 },
      { id: "p-pixel", name: "Pixel", why: "Bitmap type everywhere it can read: Silkscreen labels, Pixelify readouts.", roles: { [D]: { family: "Silkscreen", size: 92 }, [B]: { family: "Pixelify Sans", size: 110 }, [M]: { family: "Martian Mono", size: 92 } } },
      { id: "p-editorial", name: "Editorial", why: "A serif voice for sentences, a precise mono for the machine.", roles: { [S]: { family: "Newsreader", size: 108 }, [D]: { family: "Instrument Sans", weight: 100 }, [M]: { family: "Fragment Mono" } } },
    ],
  },
  endpoint: window.__pageEditorLive?.endpoint ?? "http://127.0.0.1:5198/__page-editor",
  storagePrefix: "mibbit-tools",
});

// One launcher in Mibbit's bottom bar (empty on the left) instead of floating pills; ⌥E ⌥C ⌥D ⌥T ⌥F, ⌥H hides all.
mountDock({
  storagePrefix: "mibbit-tools",
  // Side by side, these full-window rules (width: 100vw) size to the app's half instead.
  viewportWide: [".app-shell", ".prompt-bar--oled"],
  // ...and its dialogs and scrims centre in the app's half, not under the tools.
  viewportCentred: [
    ".auth-gate", ".pad-sheet-backdrop", ".export-dialog", ".about-dialog", ".mibbles-menu", ".settings-dialog",
    ".app-crash", ".rotate-hint", ".people", ".onboarding-scrim", ".mobile-gate", ".mxp-scrim",
  ],
  tools: [
    ...(colour ? [{ label: "Colour", icon: "◐", code: "KeyC", host: "colour-lab", control: colour }] : []),
    ...(design ? [{ label: "Design", icon: "✦", code: "KeyD", host: "design-generator", control: design }] : []),
    ...(texture ? [{ label: "Texture", icon: "◍", code: "KeyT", host: "texture-lab", control: texture }] : []),
    ...(type ? [{ label: "Type", icon: "Aa", code: "KeyF", host: "type-lab", control: type }] : []),
  ],
});
