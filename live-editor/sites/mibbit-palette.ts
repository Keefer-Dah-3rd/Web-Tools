/**
 * Mibbit's palette, for the Colour Lab: which scales it may regenerate and the contrast pairings
 * the app holds itself to. The pairings are copied from the Mibbit repo's
 * scripts/palette-contrast.py (PAIRS, 2026-11-24; "forbidden" rows left out); re-copy them when
 * that list changes.
 */
import type { ContrastPair, PaletteSite } from "../colour/lab";

const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950", "975", "999"];

const PAIRS: ContrastPair[] = [
  { fg: "--color-ink", bg: "--surface-base", min: 4.5, use: "main text on the page" },
  { fg: "--color-ink", bg: "--surface-raised", min: 4.5, use: "main text on a panel / card / menu" },
  { fg: "--color-ink", bg: "--surface-raised-hi", min: 4.5, use: "main text on a hovered / raised control" },
  { fg: "--color-ink", bg: "--surface-recessed", min: 4.5, use: "main text in a tray" },
  { fg: "--color-ink-secondary", bg: "--surface-raised", min: 4.5, use: "secondary text on a panel" },
  { fg: "--color-ink-secondary", bg: "--surface-raised-hi", min: 4.5, use: "secondary text on a raised control" },
  { fg: "--color-ink-muted", bg: "--surface-base", min: 4.5, use: "muted text on the page" },
  { fg: "--color-ink-muted", bg: "--surface-raised", min: 4.5, use: "muted text on a panel" },
  { fg: "--color-ink-muted", bg: "--surface-raised-hi", min: 4.5, use: "muted text on a hovered / raised control" },
  { fg: "--color-ink-muted", bg: "--surface-recessed", min: 4.5, use: "muted text in a tray" },
  { fg: "--color-divider", bg: "--surface-raised", min: 1, use: "subtle divider (decorative, no floor)" },
  { fg: "--color-outline", bg: "--surface-raised", min: 3, use: "essential control outline on a panel" },
  { fg: "--color-outline", bg: "--surface-recessed", min: 3, use: "essential control outline in a tray" },
  { fg: "--color-outline", bg: "--surface-base", min: 3, use: "essential control outline on the page" },
  { fg: "--color-on-brand", bg: "--color-brand", min: 4.5, use: "text on a filled brand button" },
  { fg: "--color-brand", bg: "--surface-raised", min: 1, use: "filled brand button vs panel (fill only \u2014 no floor, see brand-lit)" },
  { fg: "--color-brand-lit", bg: "--surface-base", min: 3, use: "lit step / LED / selected state on the page" },
  { fg: "--color-brand-lit", bg: "--surface-raised", min: 3, use: "lit step / LED / selected state on a panel" },
  { fg: "--color-brand-lit", bg: "--surface-raised-hi", min: 3, use: "lit indicator on a hovered / raised control" },
  { fg: "--color-focus", bg: "--surface-raised-hi", min: 3, use: "focus ring on a hovered / raised control" },
  { fg: "--color-focus", bg: "--surface-raised", min: 3, use: "focus ring on a panel" },
  { fg: "--color-focus", bg: "--surface-base", min: 3, use: "focus ring on the page" },
  { fg: "--color-brand-lit", bg: "--surface-recessed", min: 3, use: "lit step in a tray" },
  { fg: "--color-brand-lit", bg: "--surface-recessed-deep", min: 3, use: "lit step in a well" },
  { fg: "--color-brand-ink", bg: "--surface-base", min: 4.5, use: "brand-coloured text on the page" },
  { fg: "--color-brand-ink", bg: "--surface-raised", min: 4.5, use: "brand-coloured text on a panel" },
  { fg: "--color-brand-ink", bg: "--surface-raised-hi", min: 4.5, use: "brand-coloured text on a hovered / raised control" },
  { fg: "--color-brand-ink", bg: "--surface-recessed", min: 4.5, use: "brand-coloured text in a tray" },
  { fg: "--color-error", bg: "--surface-raised", min: 3, use: "error indicator on a panel" },
  { fg: "--color-error-ink", bg: "--surface-raised", min: 4.5, use: "error text on a panel" },
  { fg: "--color-error-ink", bg: "--surface-recessed", min: 4.5, use: "error text in a tray" },
  { fg: "--color-on-error", bg: "--color-error-fill", min: 4.5, use: "text on a filled error surface" },
  { fg: "--color-warning", bg: "--surface-raised", min: 3, use: "warning indicator on a panel" },
  { fg: "--color-warning-ink", bg: "--surface-raised", min: 4.5, use: "warning text on a panel" },
  { fg: "--color-success", bg: "--surface-raised", min: 3, use: "success indicator on a panel" },
  { fg: "--color-success-ink", bg: "--surface-raised", min: 4.5, use: "success text on a panel" },
  { fg: "--color-info", bg: "--surface-raised", min: 3, use: "info indicator on a panel" },
  { fg: "--color-info-ink", bg: "--surface-raised", min: 4.5, use: "info text on a panel" },
  { fg: "--display-ink", bg: "--display-bg", min: 4.5, use: "technical-display label on scope glass" },
  { fg: "--display-ink-faint", bg: "--display-bg", min: 3, use: "faint caption / axis label on scope glass" },
  { fg: "--display-hairline", bg: "--display-bg", min: 1, use: "region hairline on scope glass (decorative)" },
  { fg: "--color-brand-lit", bg: "--display-bg", min: 3, use: "brand accent on scope glass" },
  { fg: "--color-blue", bg: "--display-bg", min: 3, use: "scope trace on glass" },
  { fg: "--color-green", bg: "--display-bg", min: 3, use: "spectrum trace on glass" },
  { fg: "--color-lcd-on", bg: "--color-lcd-bg", min: 4.5, use: "lit LCD digit on LCD glass" },
  { fg: "--lcd-lit", bg: "--surface-recessed-deep", min: 4.5, use: "amber phosphor readout in a well" },
  { fg: "--lcd-lit", bg: "--display-black", min: 4.5, use: "phosphor digits on the mixer's peak readout" },
  { fg: "--lcd-lit-pale", bg: "--display-black", min: 4.5, use: "phosphor unit label beside a readout" },
  { fg: "--display-ink", bg: "--display-black", min: 4.5, use: "landmark tick on the master meter glass" },
  { fg: "--display-ink-faint", bg: "--display-black", min: 3, use: "faint tick on the master meter glass" },
  { fg: "--color-gold-soft", bg: "--surface-raised", min: 4.5, use: "admin crown gold on a panel" },
];

export const MIBBIT_PALETTE: PaletteSite = {
  steps: STEPS,
  // #AA0017 sits on brand-800: filled buttons, the mascot, and (via 500) lit steps and LEDs.
  brand: { prefix: "--brand", label: "Brand", hint: "buttons, lit steps, mascot", anchor: 8 },
  casing: { prefix: "--warm", label: "Casing", hint: "surfaces and text", anchor: 8 },
  supporting: [
    { prefix: "--complement", label: "Second", hint: "not used by a role yet", anchor: 8 },
    { prefix: "--analogous", label: "Third", hint: "not used by a role yet", anchor: 8 },
  ],
  locked: [
    { prefix: "--cool", label: "displays (cool grey)", anchor: 8 },
    { prefix: "--error", label: "error", anchor: 8 },
    { prefix: "--warning", label: "warning", anchor: 8 },
    { prefix: "--success", label: "success", anchor: 8 },
    { prefix: "--info", label: "info", anchor: 8 },
  ],
  pairs: PAIRS,
  seeds: [
    ["Today", "#AA0017"],
    ["Maroon", "#800020"],
    ["Oxblood", "#5C0A0A"],
    ["Burgundy", "#7B1E3A"],
    ["Wine", "#722F37"],
    ["Garnet", "#8E2433"],
    ["Rust", "#9C3B1B"],
    ["Plum", "#5E2750"],
  ],
  // The orb paints from fixed colours (web/src/ui/mascot/EmberPainter.ts sprites and its shader).
  followers: [{ selector: ".mibbit-orb, .mibbit-orb-still", label: "Mascot orb" }],
  hardcoded: [
    "web/src/ui/mascot/EmberPainter.ts: orb sprite colours (rgba 186,0,25 / 229,40,30 / 255,106,77)",
    "web/src/ui/mascot/OrbStage.ts: orb shader colours",
    "web/src/domain/mascot/Expressions.ts: PALETTE (orb crimsons, currently unused)",
    "web/src/ui/explain/highlight.ts, holdToExplain.ts: hold-to-explain ring and text (#BA0019, #FF6A4D)",
    "web/src/styles/components/walkthrough.css: tour ring (the orb's crimson #BA0019)",
  ],
  moods: ["Deeper maroon", "Warmer", "Less alarm-red", "Late-night studio", "Vintage hardware", "More playful", "Calmer casing"],
};
