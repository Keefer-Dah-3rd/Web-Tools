/**
 * What the design tools must leave alone in Mibbit.
 *
 * The mascot (the Mibbit orb, its flight sky, its still image and the tour cursor with its ripples)
 * keeps today's maroon exactly: it gets its own design system later. No tool selects, restyles,
 * recolours or previews over it.
 *
 * Tailwind v4 declares its `theme` layer after Mibbit's layers, so its defaults win for any token
 * name both define (today --radius-xs/-sm/-md/-lg and --color-white; the --font-* ones match). The
 * tools treat those as read-only rather than writing values the app can't show. Moving `theme` to
 * the front of the layer order in web/src/styles/index.css would hand them back to Mibbit's tokens;
 * that changes how the app looks (corners 2px larger, a warmer white), so it's Cris's call.
 */
import type { SiteRules } from "../site-rules";

export const MIBBIT_RULES: SiteRules = {
  protect: ['[class*="mibbit-orb"]', '[class*="fold-orb"]', "[data-orb]", '[class*="demo-cursor"]'],
  protectWords: ["mibbit-orb", "fold-orb", "data-orb", "demo-cursor", "mascot", "nibbit"],
  foreignTokenLayers: ["theme"],
};
