// The page editor's instant check for AI-sounding copy. The same patterns are spelled out for
// Claude in briefs/default.md, so the flags and the rewrites agree.

/** Patterns that make copy read as machine-written (the same list the rewrite brief gives Claude). */
export const VALUE_WORDS = /\b(seamless(ly)?|effortless(ly)?|intuitive|delightful|elevate[sd]?|unlock(s|ed)?|empower(s|ed)?|streamline[sd]?|robust|powerful|crafted|thoughtful(ly)?|journey|solution|game-?changer|next-level|at a glance|all in one place|best-in-class|cutting-edge|supercharge[sd]?|truly|incredibly|simply)\b/i;
/**
 * Finds what makes a line of copy read as machine-written. `heading` turns on the checks that
 * only apply to titles; `names` are proper nouns that may be capitalised (so "Meet Coco" isn't
 * flagged as Title Case for the name alone).
 */
export function slopIn(text: string, heading: boolean, names: readonly string[] = []): string[] {
  const named = new Set(names.map((n) => n.toLowerCase()));
  const t = text.replace(/\s+/g, " ").trim();
  const words = t.split(" ").filter(Boolean);
  const found: string[] = [];
  if (/^(meet|introducing|say hello to|built for|designed for|made for|why)\b/i.test(t) || /\b(reimagined|the future of|made simple)\b/i.test(t)) found.push("template heading");
  if (heading && words.length <= 4 && /^[a-z]+ing\b/i.test(t)) found.push("-ing + category word");
  if (/\b(not|never) (just |only )?[^.,;]{1,30}[,;]?\s*(but|it's|it is)\b/i.test(t) || /^[^,]{2,40}, not [^,]{2,40}\.?”?$/i.test(t.replace(/^“/, "")) || /\bless \w+, more \w+/i.test(t)) found.push("contrast slogan");
  const sentences = t.replace(/[“”"]/g, "").split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length >= 2 && sentences.every((x) => x.split(" ").length <= 5)) found.push("clipped fragments");
  if (VALUE_WORDS.test(t)) found.push(`empty word: “${t.match(VALUE_WORDS)![0].toLowerCase()}”`);
  if (heading && /\b(optimi[sz]ation|refinement|performance|efficiency|consolidating|leveraging)\b/i.test(t)) found.push("optimisation speak");
  if (/—/.test(t)) found.push("em dash");
  if (heading && /^[^:]{2,30}: /.test(t)) found.push("colon title");
  // Title Case: every longer word after the first is capitalised, and they aren't names.
  const later = words.slice(1).map((w) => w.replace(/[^\p{L}]/gu, "")).filter((w) => w.length > 3 && !named.has(w.toLowerCase()));
  if (heading && later.length >= 1 && later.every((w) => /^\p{Lu}/u.test(w))) found.push("Title Case");
  if (/[?!]["”]?$/.test(t)) found.push(t.endsWith("?") ? "rhetorical question" : "exclamation");
  return found;
}
