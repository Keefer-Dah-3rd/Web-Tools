/**
 * Mibbit in the Design Generator: quick picks and which of the app's tokens Claude may use.
 * Components reference ROLES (--color-brand, --surface-raised, --radius-sm…), never palette steps,
 * so the scale steps are left out (the Mibbit repo's use-design-tokens rule).
 */
import type { DesignSite } from "../design/generator";

export const MIBBIT_DESIGN: DesignSite = {
  asks: [
    "More like hardware keys",
    "Calmer",
    "Bolder",
    "More OP-1",
    "Flatter, less glow",
    "Softer neumorphism",
    "Denser",
    "More breathing room",
    "Clearer active state",
    "More playful",
  ],
  tokenPrefixes: ["--color-", "--surface-", "--radius-", "--shadow-", "--font-", "--space-", "--size-", "--display-", "--lcd-", "--neu-", "--glass", "--ease-", "--duration-", "--motion-", "--tl-", "--glimmer", "--letter-spacing-"],
  tokenSkip: /^--(brand|warm|cool|complement|analogous|error|warning|success|info)-\d/,
};
