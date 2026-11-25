/**
 * What every tool on a site must leave alone, and what it can't change from the app's own tokens.
 *
 *   protect   Parts of the page no tool may restyle, select or recolour (a mascot with its own
 *             design system to come, say). Matched with closest(): the part and everything in it.
 *   locked    Tokens a framework sets at runtime over the app's own (Tailwind v4's `theme` layer,
 *             declared after the app's layers, wins for any name both define). A tool that changed
 *             them would preview a change the app's tokens file can't deliver, so they're read-only.
 */

export interface SiteRules {
  /** CSS selectors for the protected parts. */
  protect: string[];
  /** Words that name a protected part in CSS (class names, attributes); rules mentioning one are left out. */
  protectWords: string[];
  /** Cascade layers whose custom properties beat the app's own tokens (Tailwind: "theme"). */
  foreignTokenLayers: string[];
}

/** Whether an element is, or sits inside, a protected part. */
export const isProtected = (rules: SiteRules | undefined, el: Element | null): boolean =>
  !!el && !!rules?.protect.length && !!el.closest(rules.protect.join(", "));

/** Whether an element contains a protected part (so scaling or removing it would change that part). */
export const holdsProtected = (rules: SiteRules | undefined, el: Element | null): boolean =>
  !!el && !!rules?.protect.length && !!el.querySelector(rules.protect.join(", "));

/** The custom properties declared in the foreign layers (read from the page's stylesheets, as served). */
export function lockedTokens(rules: SiteRules | undefined): Set<string> {
  const out = new Set<string>();
  if (!rules?.foreignTokenLayers.length) return out;
  const walk = (list: CSSRuleList, inForeign: boolean) => {
    for (const rule of list) {
      if (rule instanceof CSSLayerBlockRule) walk(rule.cssRules, inForeign || rules.foreignTokenLayers.includes(rule.name));
      else if (rule instanceof CSSStyleRule) {
        if (inForeign) for (const p of rule.style) if (p.startsWith("--")) out.add(p);
      } else if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules, inForeign);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules, false);
    } catch {
      /* a sheet from another origin: not the app's */
    }
  }
  return out;
}

/**
 * CSS with the parts a tool may not write taken out: declarations that set a locked token, and
 * rules whose selector reaches a protected part (or every canvas, which a mascot may draw on).
 * Returns the cleaned CSS and what was left out, for the designer.
 */
export function withoutForbidden(css: string, rules: SiteRules | undefined, locked: Set<string>): { css: string; dropped: string[] } {
  const dropped: string[] = [];
  let out = css.replace(/(--[\w-]+)\s*:[^;{}]*;?/g, (decl, name: string) => {
    if (!locked.has(name)) return decl;
    dropped.push(name);
    return "";
  });
  const markers = [...(rules?.protectWords ?? []), "canvas"];
  // A rule (selector { … }) whose selector mentions a protected part: out, body and all.
  out = out.replace(/([^{};]+)\{([^{}]*)\}/g, (rule, selector: string) => {
    if (!markers.some((m) => selector.includes(m))) return rule;
    dropped.push(selector.trim());
    return "";
  });
  return { css: out, dropped };
}
