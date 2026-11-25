// Apply: the helper writes saves into the project's code, on one branch, one commit per save.
//
//   palette  Deterministic: the changed scale steps are written into the tokens file, the
//            contrast script is re-run (a failing pairing stops the apply and puts the file
//            back) and its table is regenerated.
//   design   Claude Code writes the variation into the component's stylesheet.
//   type     Deterministic for fonts: the --font-* tokens (tokens.css and the matching lines in
//            Tailwind's @theme, which would otherwise win), caps tracking, and one marked font
//            block per role in index.html. Weight and spacing moves on component rules go to Claude Code.
//   page     Claude Code writes the toolbar's text and style edits into the code, then the
//            helper marks the save applied so the toolbar reloads.
//
// Claude Code runs headless in restricted mode: file tools only (Read, Edit, Grep, Glob), confined
// to the project folder, no shell, no settings, no MCP, the user's own sign-in (never an API key).
// The helper checks what changed (only the files a kind may touch), type-checks code changes,
// and commits. Anything else puts the files back and reports why.
//
// Guards: the project must be on the configured branch with no uncommitted changes to tracked
// files; one apply at a time; Undo only reverts commits this helper made (applied-log.json).
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const run = (cmd, args, cwd, timeout = 120_000) =>
  new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout: String(stdout), stderr: String(stderr) }),
    );
  });
const git = (cfg, ...args) => run("git", args, cfg.apply.repo);

const claudeBin = () => {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const local = join(homedir(), ".local", "bin", "claude");
  return existsSync(local) ? local : "claude";
};

/** One headless Claude Code run that may only read and edit files inside the project. */
function claudeEdits(cfg, prompt) {
  return new Promise((resolve) => {
    const args = [
      "-p", prompt,
      "--model", cfg.model,
      "--effort", cfg.effort,
      "--restricted",
      "--strict-mcp-config",
      "--tools", "Read,Edit,Grep,Glob",
      "--permission-mode", "acceptEdits",
      "--no-session-persistence",
      "--output-format", "json",
    ];
    const { ANTHROPIC_API_KEY: _key, ...env } = process.env;
    let out = "";
    let err = "";
    let child;
    try {
      child = spawn(claudeBin(), args, { cwd: cfg.apply.repo, env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return resolve({ ok: false, error: `Couldn't start Claude Code: ${e.message}` });
    }
    const timer = setTimeout(() => child.kill("SIGTERM"), 8 * 60_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Couldn't start Claude Code: ${e.message}` });
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(out);
        if (data.is_error) return resolve({ ok: false, error: String(data.result ?? "Claude Code stopped with an error.").slice(0, 400) });
        resolve({ ok: true, summary: String(data.result ?? "").trim().slice(0, 600) });
      } catch {
        resolve({ ok: false, error: (err || out || "No answer from Claude Code.").slice(0, 400) });
      }
    });
  });
}

// ---- the project's state

async function ready(cfg) {
  const branch = (await git(cfg, "branch", "--show-current")).stdout.trim();
  if (branch !== cfg.apply.branch) return `The project is on “${branch || "no branch"}”, not “${cfg.apply.branch}”. Ask Claude to switch it back.`;
  const dirty = (await git(cfg, "status", "--porcelain", "--untracked-files=no")).stdout.trim();
  if (dirty) return `The project has code changes that aren't committed yet (${dirty.split("\n").length} file(s)). Ask Claude to tidy them up first.`;
  return null;
}

const untrackedNow = async (cfg) => new Set((await git(cfg, "ls-files", "--others", "--exclude-standard")).stdout.split("\n").filter(Boolean));

/** What this apply changed: modified tracked files, plus untracked files that weren't there before. */
async function changedFiles(cfg, untrackedBefore) {
  const tracked = (await git(cfg, "diff", "--name-only", "HEAD")).stdout.split("\n").filter(Boolean);
  const fresh = [...(await untrackedNow(cfg))].filter((f) => !untrackedBefore.has(f));
  return [...tracked, ...fresh];
}

/** Put the project back as it was: tracked files from the last commit, new files removed. */
async function putBack(cfg, files, untrackedBefore) {
  if (!files.length) return;
  const untracked = await untrackedNow(cfg);
  const tracked = files.filter((f) => !untracked.has(f));
  const fresh = files.filter((f) => untracked.has(f) && !untrackedBefore.has(f));
  if (tracked.length) await git(cfg, "checkout", "HEAD", "--", ...tracked);
  if (fresh.length) await git(cfg, "clean", "-f", "--", ...fresh);
}

async function commit(cfg, files, message) {
  await git(cfg, "add", "--", ...files);
  const msg = `${message}\n\nApplied by the design toolbar (Web-Tools live editor).\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  const res = await git(cfg, "commit", "-q", "-m", msg);
  if (res.code !== 0) throw new Error(`Couldn't commit: ${(res.stderr || res.stdout).slice(0, 300)}`);
  return (await git(cfg, "rev-parse", "--short", "HEAD")).stdout.trim();
}

const logFile = (cfg) => join(cfg.editsDir, "applied-log.json");
const readLog = (cfg) => {
  try {
    return JSON.parse(readFileSync(logFile(cfg), "utf8"));
  } catch {
    return [];
  }
};
const writeLog = (cfg, entry) => writeFileSync(logFile(cfg), `${JSON.stringify([entry, ...readLog(cfg)].slice(0, 200), null, 2)}\n`);

/** Type-check the web app when code (not only CSS) changed. */
async function typecheck(cfg, files) {
  if (!cfg.apply.typecheck || !files.some((f) => /\.(tsx?|jsx?)$/.test(f))) return null;
  const [cmd, ...args] = cfg.apply.typecheck;
  const res = await run(cmd, args, join(cfg.apply.repo, cfg.apply.typecheckIn ?? "."), 300_000);
  return res.code === 0 ? null : (res.stdout + res.stderr).trim().split("\n").slice(0, 8).join("\n");
}

const within = (file, globs) => globs.some((g) => (g.endsWith("/**") ? file.startsWith(g.slice(0, -2)) : file === g));

/**
 * Why the project's contrast script said no: its failing rows (a ❌ in a markdown table, or a
 * line saying fail), or the error it stopped on (a role it can't read).
 */
function contrastWhy(res) {
  // Only the required pairings: a "forbidden pairings" table lists rules, not failures.
  const rows = res.stdout
    .split(/\n## Forbidden/i)[0]
    .split("\n")
    .filter((l) => /❌|\bfail/i.test(l) && !/^\*\*/.test(l))
    .map((l) => l.replace(/`/g, "").replace(/\s*\|\s*/g, " | ").replace(/^ \| | \| $/g, "").trim())
    .slice(0, 5);
  const stopped = (res.stderr.trim().split("\n").pop() ?? "").replace(/^\w*Error:\s*/, "");
  return rows.length ? rows.join("\n") : stopped ? `It stopped on: ${stopped}` : "";
}

// ---- palette: deterministic

const WHEEL_NAMES = ["orange", "amber", "yellow", "chartreuse", "green", "emerald", "cyan", "azure", "blue", "indigo", "violet", "purple", "magenta", "pink", "red", "crimson"];
/** The wheel's name for a hue (the names sit 22.5° apart from orange at 45°). */
const hueName = (h) => WHEEL_NAMES[Math.round((((h - 45) % 360) + 360) % 360 / 22.5) % 16];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function applyPalette(cfg, save, untrackedBefore) {
  const a = cfg.apply;
  const { lchToHex } = await import("./colour/palette.ts");
  // Every file this apply writes, with what it held before, so any failure puts all of them back.
  const before = new Map();
  const edit = (rel, change) => {
    const path = join(a.repo, rel);
    const text = before.has(rel) ? readFileSync(path, "utf8") : readFileSync(path, "utf8");
    if (!before.has(rel)) before.set(rel, text);
    writeFileSync(path, change(text));
  };
  const restore = () => {
    for (const [rel, text] of before) writeFileSync(join(a.repo, rel), text);
  };

  try {
    let count = 0;
    const expected = Object.values(save.scales ?? {}).reduce((n, steps) => n + Object.keys(steps).length, 0);
    edit(a.tokens, (css) => {
      for (const [prefix, steps] of Object.entries(save.scales ?? {})) {
        if (!/^--[a-z][\w-]*$/.test(prefix)) throw new Error(`Odd scale name ${prefix}.`);
        for (const [step, hex] of Object.entries(steps)) {
          if (!/^#[0-9A-Fa-f]{6}$/.test(hex) || !/^\d+$/.test(step)) throw new Error(`Odd value ${prefix}-${step}: ${hex}.`);
          const re = new RegExp(`(^\\s*${esc(prefix)}-${step}\\s*:\\s*)#[0-9A-Fa-f]{6}(\\s*;)`, "m");
          if (re.test(css)) {
            css = css.replace(re, `$1${hex.toUpperCase()}$2`);
            count++;
          }
        }
      }
      if (count !== expected) throw new Error(`Found ${count} of ${expected} scale steps in ${a.tokens}; nothing changed.`);
      // Single colour tokens (the accents): the value changes, any comment after it stays.
      for (const [token, hex] of Object.entries(save.roles ?? {})) {
        if (!/^--[a-z][\w-]*$/.test(token) || !/^#[0-9A-Fa-f]{6}$/.test(hex)) throw new Error(`Odd colour ${token}: ${hex}.`);
        const re = new RegExp(`(^\\s*${esc(token)}\\s*:\\s*)[^;]+;`, "m");
        if (!re.test(css)) throw new Error(`${token} isn't in ${a.tokens}; nothing changed.`);
        css = css.replace(re, `$1${hex.toLowerCase()};`);
      }
      // The track wheel: slot 0 stays a hex literal, the rest OKLCH, and each comment names its new hue.
      const lch = save.tracks?.lch;
      if (lch) {
        if (!Array.isArray(lch) || lch.length !== save.tracks.tokens.length) throw new Error("The track colours don't add up; nothing changed.");
        lch.forEach(([L, C, H], i) => {
          const token = save.tracks.tokens[i];
          const value = i === 0 ? lchToHex({ L, C, H }).toLowerCase() : `oklch(${L.toFixed(2)} ${C.toFixed(2)} ${H})`;
          const re = new RegExp(`(^\\s*${esc(token)}:\\s*)[^;]+;(\\s*)\\/\\*[^*]*\\*\\/`, "m");
          if (!re.test(css)) throw new Error(`${token} isn't in ${a.tokens} as expected; nothing changed.`);
          css = css.replace(re, `$1${value};$2/* ${hueName(H)}${i === 0 ? " (the wheel's start)" : ""} */`);
        });
      }
      // The brand's anchor colour is named in the file's comments too: keep them true.
      const oldAnchor = save.was?.["--brand"]?.["800"];
      const newAnchor = save.scales?.["--brand"]?.["800"];
      if (oldAnchor && newAnchor) css = css.replaceAll(oldAnchor.toUpperCase(), newAnchor.toUpperCase());
      return css;
    });

    // The JS mirror of the track wheel and the test that pins slot 0's literal.
    if (save.tracks?.lch && a.tracks) {
      const lch = save.tracks.lch;
      edit(a.tracks.mirror, (js) => {
        lch.forEach(([L, C, H], i) => {
          const re = new RegExp(`^(\\s*)\\[[\\d.]+, [\\d.]+, \\d+\\],(\\s*)\\/\\/ ${i}\\b.*$`, "m");
          if (!re.test(js)) throw new Error(`Couldn't find track colour ${i} in ${a.tracks.mirror}; nothing changed.`);
          js = js.replace(re, `$1[${L.toFixed(2)}, ${C.toFixed(2)}, ${H}],$2// ${String(i).padEnd(2)} ${hueName(H)}${i === 0 ? " (the wheel's start)" : ""}`);
        });
        return js;
      });
      if (a.tracks.test) {
        const slot0 = lchToHex({ L: lch[0][0], C: lch[0][1], H: lch[0][2] }).toLowerCase();
        edit(a.tracks.test, (t) => t.replace(/(--pad-color-0:\\s\*)#[0-9a-f]{6}/, `$1${slot0}`));
      }
    }

    if (a.contrastScript) {
      const res = await run("python3", [a.contrastScript], a.repo);
      if (res.code !== 0) {
        const why = contrastWhy(res);
        throw new Error(`The palette fails the app's contrast check, so it wasn't applied.${why ? `\n${why}` : ""}`);
      }
      if (a.contrastDoc) {
        before.set(a.contrastDoc, readFileSync(join(a.repo, a.contrastDoc), "utf8"));
        writeFileSync(join(a.repo, a.contrastDoc), res.stdout);
      }
    }
    if (save.tracks?.lch && a.tracks?.check) {
      const [cmd, ...args] = a.tracks.check;
      const res = await run(cmd, args, join(a.repo, a.tracks.checkIn ?? "."), 300_000);
      if (res.code !== 0) {
        const plain = (res.stdout + res.stderr).replace(/\u001b\[[0-9;]*m/g, "");
        const failing = plain.split("\n").filter((l) => /✗|×|FAIL|AssertionError|expected/i.test(l)).slice(0, 4).join("\n");
        throw new Error(`The track colours broke their test, so the palette wasn't applied.${failing ? `\n${failing}` : ""}`);
      }
    }

    const files = [...before.keys()];
    const changed = await changedFiles(cfg, untrackedBefore);
    const breach = await guardBreach(cfg, changed.filter((f) => files.includes(f)));
    if (breach) throw new Error(`${breach} The palette wasn't applied.`);
    const what = [
      Object.keys(save.scales ?? {}).length && `${Object.keys(save.scales).length} scale(s)`,
      Object.keys(save.roles ?? {}).length && `${Object.keys(save.roles).length} accent colour(s)`,
      save.tracks?.lch && "the track colours",
    ].filter(Boolean);
    const anchor = save.scales?.["--brand"]?.["800"];
    const sha = await commit(cfg, changed.filter((f) => files.includes(f)), `${save.tracks?.lch || save.roles && Object.keys(save.roles).length ? "Theme" : "Palette"}: ${save.name} (brand ${anchor ?? "unchanged"})`);
    return { commit: sha, files, summary: `Wrote ${what.join(", ")} into the app${a.contrastDoc ? " and refreshed the contrast table" : ""}.` };
  } catch (e) {
    restore();
    throw e;
  }
}

// ---- design and page edits: Claude Code

/** What every code change must leave alone (the site's apply.guard), as words for Claude. */
const guardText = (cfg, save) => {
  const g = cfg.apply.guard ?? {};
  const lines = [];
  if (g.protectFiles?.length) lines.push(`- Don't change ${g.protectFiles.join(", ")}.`);
  if (g.protectWords?.length) lines.push(`- Don't change any rule, token or line about ${g.protectWords.join(", ")}: the mascot keeps exactly the look it has now (its own design system comes later).`);
  lines.push("- Don't add Tailwind utility classes, @apply, @theme, @tailwind or Tailwind config; style through the app's own CSS and tokens.");
  const locked = Array.isArray(save.locked) ? save.locked : [];
  if (locked.length) lines.push(`- Don't change these tokens (Tailwind's theme sets them at runtime, so the tokens file can't): ${locked.join(", ")}.`);
  return `\n\nLeave alone:\n${lines.join("\n")}`;
};

const designPrompt = (save, json) => save.texture ? texturePrompt(save, json) : save.target?.scope === "app" ? appDesignPrompt(json) : `You are applying a design variation that the designer tried live in the running app and chose to keep. Here is the save:

\`\`\`json
${json}
\`\`\`

What it is: "${save.name}": ${save.why}
The part: ${save.target?.label} (${save.target?.scope === "all" ? "every element with that class" : "one element"}), ${save.target?.source ?? ""}. Selector: ${save.target?.selector}
The CSS that was tried is nested CSS where & is the part; it was applied on top of the app's styles as \`${save.target?.selector} { <css> }\`.

Do this:
1. Find the stylesheet that styles this part today (Grep web/src/styles for the class in the selector).
2. Write the variation into that stylesheet so the app looks exactly like it did with the variation on: change the declarations it overrides in the existing rules, add rules it needs (hover, active, ::after and so on) next to them, inside the same @layer. Don't append it as an extra override layer.
3. Use only the tokens it uses (var(--…)); never add raw hex or rgb. A raw px border-radius becomes the nearest --radius-* step in web/src/styles/tokens.css. Keep the file's style and comments; update a comment if it now says something untrue.
4. Change only CSS files under web/src/styles/. Don't touch TSX, tokens.css or anything else. If the variation can't be written without a markup change, change nothing and say so.

When done, reply with one plain sentence saying what changed and in which file.`;

const appDesignPrompt = (json) => `You are applying a whole-app design variation that the designer tried live in the running app and chose to keep. Here is the save:

\`\`\`json
${json}
\`\`\`

The CSS that was tried is nested under :root (& is :root). Make the app look exactly as it did with it on:
1. Declarations on & are role tokens (--radius-*, --shadow-*, --surface-*, --font-*, spacing …): change those roles where they are defined, in web/src/styles/tokens.css (the ROLES and recipe sections). Never change the palette scale steps (--brand-*, --warm-*, --cool-* and the like), and never add raw hex or rgb.
   Colour roles (--surface-*, --color-*, --display-*) must stay a var() of ONE palette step (the project's contrast script reads nothing else): where the variation mixes colours (color-mix …) for one of them, point the role at the palette step nearest to what it showed. Shadows, highlights and other recipes may keep color-mix.
2. Rules for & .class go into the stylesheet under web/src/styles/ that styles that class (Grep for it), changing the declarations they override, inside the same @layer. Don't append them as an extra override layer.
3. Keep each file's style and comments; update a comment if it now says something untrue.
4. Change only files under web/src/styles/. If something can't be written without a markup change, leave it and say so.

When done, reply with one or two plain sentences saying what changed and where.`;

const texturePrompt = (save, json) => `You are applying a surface texture (a material finish) that the designer tried live across the running app with the Texture Lab and chose to keep. Here is the save:

\`\`\`json
${json}
\`\`\`

What it is: "${save.name}": ${save.why}

The colours stay exactly as they are; only the finish changes. Make the app look as it did with the texture on:
1. "tokens" are the shared shadow and sheen roles (--shadow-neu-raised, --shadow-neu-pressed, --shadow-neu-flush, --screen-edge-shadow, --glass-sheen-*, --glimmer-color). Change each where it is defined in web/src/styles/tokens.css to the value given. Keep the color-mix recipes; tidy numbers (round to whole px and whole %) but don't change the look. Update the comments above them so they describe the new finish.
2. If "overlay" is given, add --texture-overlay and --texture-overlay-size next to those roles in tokens.css, with a short comment naming the finish. The overlay may be long data: SVG images; keep them exactly.
3. Each entry in "rules" is one existing rule: its file (relative to the repo; if it isn't a real file, Grep web/src/styles for the selector), its cascade layer, any @media around it, its selector, what its background and box-shadow were ("was"), and the declarations it now needs ("now"). Change that rule in place so it has those declarations instead of the old background / box-shadow: replace the gradient layers in place, don't append an override. When "now" sets background-image/-color/-size/-position/-repeat, write them as longhands (or one background shorthand that says the same thing). var(--texture-overlay) and var(--texture-overlay-size) refer to the tokens from step 2.
4. Don't change any rule not listed, any colour token, any palette step, or any TSX. Keep each file's style and comments; update a comment if it now says something untrue (for example one that describes the old gloss).
5. Change only files under web/src/styles/. If a rule can't be found, skip it and say so.

When done, reply with one or two plain sentences saying what changed and how many rules, and anything you skipped.`;

const pagePrompt = (save, json) => `You are applying edits the designer made in the running app with the in-browser toolbar. Here is the save:

\`\`\`json
${json}
\`\`\`

Each edit has a CSS selector, the components it sits in ("source": a file and approximate line when known, then "in A < B < C"), its tag and classes, and what changed:
- newText / html: the words changed from wasText. Change the string in the JSX (or the copy file it comes from) so it says newText. Keep any markup inside it.
- color: a text colour (for the element and the words inside it) picked from the app's palette.
- fill: the object's own colour (a pad, button, knob or icon). "plan" says how it was painted: plan.vars are the colour variables it paints with (set those on the component's rule, so its gradients, glow and pseudo-elements follow); otherwise recolour its gradient stops / background (keep the shading), coloured glow and SVG fill/stroke (plan.shapes).
- For both: use the matching role token (var(--color-…) / var(--surface-…)) in the component's stylesheet; the swatch hexes match the tokens in web/src/styles/tokens.css. Never write raw hex.
- fontSize (px) / type (a type style: title, status, tab, value, body, heading, small, lcd) / scale: write it into the component's stylesheet using the app's font tokens.
- removed: take the element out of the JSX only if it's clearly decorative or redundant; otherwise leave it and say so.

Find each element by its components and classes (Grep web/src). Change only files under web/src/. Don't touch tokens.css. Keep each file's style.

When done, reply with one or two plain sentences saying what changed, and anything you left alone and why.`;

async function applyWithClaude(cfg, kind, save, untrackedBefore) {
  const json = JSON.stringify(save, null, 2).slice(0, 60_000);
  const prompt = (kind === "design" ? designPrompt(save, json) : pagePrompt(save, json)) + guardText(cfg, save);
  const allowed = kind === "design" ? ["web/src/styles/**"] : ["web/src/**"];
  const answer = await claudeEdits(cfg, prompt);
  let changed = await changedFiles(cfg, untrackedBefore);
  if (!answer.ok) {
    await putBack(cfg, changed, untrackedBefore);
    throw new Error(answer.error);
  }
  if (!changed.length) throw new Error(answer.summary || "Claude didn't change anything.");
  // tokens.css is the Colour Lab's, except that a whole-app design may change its roles.
  const tokensOk = kind === "design" && save.target?.scope === "app";
  const outside = changed.filter((f) => !within(f, allowed) || (f === cfg.apply.tokens && !tokensOk));
  if (outside.length) {
    await putBack(cfg, changed, untrackedBefore);
    throw new Error(`Claude changed files it shouldn't (${outside.join(", ")}), so nothing was kept.`);
  }
  const breach = await guardBreach(cfg, changed);
  if (breach) {
    await putBack(cfg, changed, untrackedBefore);
    throw new Error(`${breach} Nothing was kept.`);
  }
  const broken = await typecheck(cfg, changed);
  if (broken) {
    await putBack(cfg, changed, untrackedBefore);
    throw new Error(`The change didn't type-check, so nothing was kept:\n${broken}`);
  }
  // Tokens changed: the app's contrast pairings must still hold, and their table follows. A
  // failure goes back to Claude (twice at most) to adjust the roles before the change is dropped.
  if (changed.includes(cfg.apply.tokens) && cfg.apply.contrastScript) {
    let res = await run("python3", [cfg.apply.contrastScript], cfg.apply.repo);
    for (let round = 0; res.code !== 0 && round < 2; round++) {
      const fix = await claudeEdits(
        cfg,
        `You just changed web/src/styles/tokens.css for a design the designer chose, and the app's contrast check (python3 ${cfg.apply.contrastScript}) now fails on:\n\n${contrastWhy(res)}\n\nAdjust only the roles you changed (point them at a darker or lighter palette step, or adjust a recipe) so every listed pairing clears its floor, staying as close to the design as you can. Each colour role stays a var() of one palette step. Change only web/src/styles/tokens.css. Reply with one sentence saying what you adjusted.`,
      );
      if (!fix.ok) break;
      res = await run("python3", [cfg.apply.contrastScript], cfg.apply.repo);
    }
    if (res.code !== 0) {
      await putBack(cfg, await changedFiles(cfg, untrackedBefore), untrackedBefore);
      const why = contrastWhy(res);
      throw new Error(`The change fails the app's contrast check, so nothing was kept.${why ? `\n${why}` : ""}`);
    }
    changed = await changedFiles(cfg, untrackedBefore);
    const strayed = changed.filter((f) => !within(f, allowed) && !(f === cfg.apply.tokens && tokensOk));
    if (strayed.length) {
      await putBack(cfg, changed, untrackedBefore);
      throw new Error(`Fixing contrast touched files it shouldn't (${strayed.join(", ")}), so nothing was kept.`);
    }
    if (cfg.apply.contrastDoc) {
      writeFileSync(join(cfg.apply.repo, cfg.apply.contrastDoc), res.stdout);
      if (!changed.includes(cfg.apply.contrastDoc)) changed.push(cfg.apply.contrastDoc);
    }
  }
  const title = kind === "design" ? `Design: ${save.name} (${save.target?.scope === "app" ? "whole app" : save.target?.label})` : `Page edits: ${save.page} (${save.edits?.length ?? 0} change${save.edits?.length === 1 ? "" : "s"})`;
  const sha = await commit(cfg, changed, title);
  return { commit: sha, files: changed, summary: answer.summary };
}

/**
 * Whether a change touched what it must not (apply.guard): protected files, lines about protected
 * words, or Tailwind machinery. Reads the real diff, not what Claude says it did.
 */
async function guardBreach(cfg, changed) {
  const g = cfg.apply.guard ?? {};
  const files = changed.filter((f) => (g.protectFiles ?? []).some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)));
  if (files.length) return `The change touched ${files.join(", ")}, which the tools leave alone.`;
  const diff = (await git(cfg, "diff", "-U0", "HEAD", "--", ...changed.filter((f) => existsSync(join(cfg.apply.repo, f))))).stdout;
  const touched = diff.split("\n").filter((l) => /^[+-](?![+-])/.test(l));
  const word = (g.protectWords ?? []).find((w) => touched.some((l) => l.includes(w)));
  if (word) return `The change touched lines about “${word}” (the mascot keeps its look).`;
  const tailwind = touched.find((l) => l.startsWith("+") && /@apply|@theme|@tailwind|@layer\s+theme|tailwindcss/.test(l));
  if (tailwind) return "The change added Tailwind machinery (the tools style through the app's own CSS).";
  return null;
}

// ---- type styles: fonts deterministic, rule weight/spacing via Claude

const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,60}$/;
const V1_WEIGHTS = "100,200,300,400,500,600,700,800,900";
/** index.html holds one marked block per font role that a type style changed. */
const blockOpen = (token) => `<!-- type-lab:${token} `;
const blockClose = (token) => `<!-- /type-lab:${token} -->`;

/** Only @font-face blocks whose files come from Google's font host or the app's own /fonts/. */
function safeFaces(css) {
  const blocks = String(css ?? "").match(/@font-face\{[^{}]*\}/g) ?? [];
  if (blocks.join("\n").length !== String(css ?? "").trim().length) throw new Error("The saved fonts hold something other than @font-face rules; nothing changed.");
  for (const b of blocks) {
    for (const [, url] of b.matchAll(/url\("?([^")]+)"?\)/g))
      if (!/^https:\/\/fonts\.gstatic\.com\//.test(url) && !/^\/fonts\/[\w.\-]+$/.test(url)) throw new Error(`Odd font file ${url}; nothing changed.`);
    if (/<|>|@import|expression|javascript:/i.test(b)) throw new Error("Odd font rule; nothing changed.");
  }
  return blocks;
}

/** A font stack split into its families (commas inside quotes don't occur in family names). */
const families = (stack) => stack.split(",").map((f) => f.trim()).filter(Boolean);

const typePrompt = (save, json) => `You are applying the weight and letter-spacing part of a type style ("${save.name}") that the designer tried live across the running app with the Type Lab and chose to keep. The fonts themselves are already written into the tokens; don't touch web/src/styles/tokens.css, web/src/styles/index.css or web/index.html.

Here are the rules to change:

\`\`\`json
${json}
\`\`\`

Each entry is one existing CSS rule: the stylesheet the browser saw it in (often web/src/styles/index.css, which only @imports the others: Grep web/src/styles for the selector to find the file it's written in), the @layer / @media blocks around it ("wrap"), its selector, what its font-weight and letter-spacing were ("was"; "(inherited)" means the rule didn't set it), and the declarations it now needs ("now"). Change each rule in place so it has those declarations: replace an existing font-weight / letter-spacing, or add the line next to the rule's font-family. Don't add override rules or new layers. Keep calc() and var() exactly as given. Change only CSS files under web/src/styles/. If a rule can't be found, skip it and say so.

When done, reply with one or two plain sentences saying how many rules changed, and anything you skipped.`;

async function applyType(cfg, save, untrackedBefore) {
  const a = cfg.apply;
  const html = a.html ?? "web/index.html";
  const theme = a.themeCss ?? "web/src/styles/index.css";
  const before = new Map();
  const edit = (rel, change) => {
    const path = join(a.repo, rel);
    const text = readFileSync(path, "utf8");
    if (!before.has(rel)) before.set(rel, text);
    writeFileSync(path, change(text));
  };
  const restore = () => {
    for (const [rel, text] of before) writeFileSync(join(a.repo, rel), text);
  };
  try {
    const roles = (Array.isArray(save.roles) ? save.roles : []).filter((r) => r.now);
    for (const r of roles) {
      if (!/^--font-[a-z][\w-]*$/.test(r.token)) throw new Error(`Odd font role ${r.token}; nothing changed.`);
      if (!FAMILY.test(String(r.now.first ?? ""))) throw new Error(`Odd font name ${r.now.first}; nothing changed.`);
      if (r.now.google && !FAMILY.test(r.now.google)) throw new Error(`Odd font name ${r.now.google}; nothing changed.`);
    }
    for (const [t, v] of Object.entries(save.tracking ?? {}))
      if (!/^--[\w-]+$/.test(t) || !/^-?[\d.]+(em|px|rem)?$/.test(String(v))) throw new Error(`Odd tracking ${t}: ${v}; nothing changed.`);

    // Each role's new stack: the new family in front of the stack the code has now. A family an
    // earlier type style put in front (it has a block in index.html) is replaced, not kept behind.
    const page = readFileSync(join(a.repo, html), "utf8");
    const tokensText = readFileSync(join(a.repo, a.tokens), "utf8");
    const tokens = {};
    for (const r of roles) {
      const now = tokensText.match(new RegExp(`^\\s*${esc(r.token)}\\s*:\\s*([^;]+);`, "m"))?.[1];
      if (!now) throw new Error(`${r.token} isn't in ${a.tokens}; nothing changed.`);
      const tail = families(now).slice(page.includes(blockOpen(r.token)) ? 1 : 0);
      tokens[r.token] = [`"${r.now.first}"`, ...tail.filter((f) => f.replace(/["']/g, "") !== r.now.first)].join(", ");
    }

    // tokens.css: each font role and tracking token where it's defined.
    edit(a.tokens, (css) => {
      for (const [t, v] of [...Object.entries(tokens), ...Object.entries(save.tracking ?? {})]) {
        const re = new RegExp(`(^\\s*${esc(t)}\\s*:\\s*)[^;]+;`, "m");
        if (!re.test(css)) throw new Error(`${t} isn't in ${a.tokens}; nothing changed.`);
        css = css.replace(re, `$1${v};`);
      }
      return css;
    });
    // Tailwind's @theme declares the same font tokens and its layer wins: they must say the same.
    if (Object.keys(tokens).length && existsSync(join(a.repo, theme)))
      edit(theme, (css) => {
        const start = css.indexOf("@theme");
        if (start < 0) return css;
        const end = css.indexOf("}", start);
        let block = css.slice(start, end);
        for (const [t, v] of Object.entries(tokens)) block = block.replace(new RegExp(`(^\\s*${esc(t)}\\s*:\\s*)[^;]+;`, "m"), `$1${v};`);
        return css.slice(0, start) + block + css.slice(end);
      });
    // index.html: one marked block per role that loads its font (a later style replaces it).
    if (roles.length)
      edit(html, (text) => {
        for (const r of roles) {
          const s0 = text.indexOf(blockOpen(r.token));
          const close = blockClose(r.token);
          const e0 = text.indexOf(close);
          if (s0 >= 0 && e0 > s0) text = text.slice(0, s0).replace(/[ \t]*$/, "") + text.slice(e0 + close.length).replace(/^\n/, "");
          const faces = r.now.faces ? safeFaces(r.now.faces) : [];
          if (!r.now.google && !faces.length) continue;
          const what = `${r.family ?? r.now.first}${r.size !== 100 ? ` at ${r.size}%` : ""}`;
          const lines = [
            `    ${blockOpen(r.token)}— ${String(r.label).replace(/--/g, "-")} font, from the type style “${String(save.name).replace(/--/g, "-").slice(0, 60)}” (Type Lab): ${what}. Google Fonts; self-host before launch. -->`,
            '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
            ...(r.now.google ? [`    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=${r.now.google.replace(/ /g, "+")}:${V1_WEIGHTS}&amp;display=swap" />`] : []),
            ...(faces.length ? ["    <style>", ...faces.map((f) => `      ${f}`), "    </style>"] : []),
            `    ${close}`,
          ];
          const at = text.indexOf("</head>");
          if (at < 0) throw new Error(`${html} has no </head>; nothing changed.`);
          text = `${text.slice(0, at).replace(/[ \t]*$/, "")}${lines.join("\n")}\n  ${text.slice(at)}`;
        }
        return text;
      });

    let changed = await changedFiles(cfg, untrackedBefore);
    // index.css is off limits to the tools, except its matching --font-* lines in @theme.
    const themeDiff = (await git(cfg, "diff", "-U0", "HEAD", "--", theme)).stdout.split("\n").filter((l) => /^[+-](?![+-])/.test(l));
    if (themeDiff.some((l) => !/^[+-]\s*--font-[\w-]+\s*:/.test(l))) throw new Error(`The change touched more of ${theme} than its font lines; nothing changed.`);
    const breach = await guardBreach(cfg, changed.filter((f) => f !== theme));
    if (breach) throw new Error(`${breach} Nothing changed.`);

    let summary = [
      roles.length && `fonts for ${roles.map((r) => r.label).join(", ")}`,
      Object.keys(save.tracking ?? {}).length && "caps tracking",
    ].filter(Boolean);
    const ruleEdits = Array.isArray(save.rules) ? save.rules : [];
    if (ruleEdits.length) {
      const mine = new Map([...before.keys()].map((f) => [f, readFileSync(join(a.repo, f), "utf8")]));
      const answer = await claudeEdits(cfg, typePrompt(save, JSON.stringify(ruleEdits, null, 2).slice(0, 60_000)) + guardText(cfg, save));
      changed = await changedFiles(cfg, untrackedBefore);
      const outside = changed.filter((f) => !before.has(f) && !within(f, ["web/src/styles/**"]));
      const meddled = [...mine].filter(([f, text]) => readFileSync(join(a.repo, f), "utf8") !== text).map(([f]) => f);
      if (!answer.ok || outside.length || meddled.length) {
        await putBack(cfg, changed.filter((f) => !before.has(f)), untrackedBefore);
        throw new Error(!answer.ok ? answer.error : `Claude changed files it shouldn't (${[...outside, ...meddled].join(", ")}), so nothing was kept.`);
      }
      const breach2 = await guardBreach(cfg, changed.filter((f) => f !== theme));
      if (breach2) {
        await putBack(cfg, changed.filter((f) => !before.has(f)), untrackedBefore);
        throw new Error(`${breach2} Nothing was kept.`);
      }
      summary.push(answer.summary ? `weight and spacing (${answer.summary})` : "weight and spacing");
    }
    const sha = await commit(cfg, changed, `Type: ${save.name}`);
    return { commit: sha, files: changed, summary: `Wrote ${summary.join(", ")} into the app.` };
  } catch (e) {
    restore();
    throw e;
  }
}

// ---- the queue

let busy = null;

/**
 * Apply one save. kind: "palette" | "design" | "type" | "page"; file: the save's file in editsDir.
 * Returns { commit, files, summary } or throws with a message for the designer.
 */
export async function applySave(cfg, kind, name) {
  if (!cfg.apply) throw new Error("This site isn't set up to write into code (no \"apply\" in its config).");
  if (busy) throw new Error(`Still applying “${busy}”. Try again when it's done.`);
  const file = join(cfg.editsDir, name);
  if (!/^[a-z0-9-]+\.json$/.test(name) || !existsSync(file)) throw new Error("That save isn't there any more.");
  busy = name;
  try {
    const why = await ready(cfg);
    if (why) throw new Error(why);
    const save = JSON.parse(readFileSync(file, "utf8"));
    const untrackedBefore = await untrackedNow(cfg);
    let result;
    try {
      result = kind === "palette" ? await applyPalette(cfg, save, untrackedBefore) : kind === "type" ? await applyType(cfg, save, untrackedBefore) : await applyWithClaude(cfg, kind, save, untrackedBefore);
    } catch (e) {
      // Logged too: the app's dev server may have reloaded the page before this answer arrives.
      writeLog(cfg, { kind, save: name, name: save.name ?? save.page, failed: String(e?.message ?? e).slice(0, 600), at: new Date().toISOString() });
      throw e;
    }
    writeLog(cfg, { kind, save: name, name: save.name ?? save.page, commit: result.commit, files: result.files, summary: result.summary, at: new Date().toISOString() });
    if (kind === "page" && save.page && save.savedAt) writeFileSync(join(cfg.editsDir, `${save.page}.applied.json`), `${JSON.stringify({ savedAt: save.savedAt, commit: result.commit })}\n`);
    return result;
  } finally {
    busy = null;
  }
}

/** Undo one applied save: a revert commit, only for commits this helper made. */
export async function undoApply(cfg, sha) {
  if (!cfg.apply) throw new Error("This site isn't set up to write into code.");
  if (busy) throw new Error(`Still applying “${busy}”. Try again when it's done.`);
  const entry = readLog(cfg).find((e) => e.commit === sha && !e.undone);
  if (!entry) throw new Error("That change isn't one the toolbar made, or it's already undone.");
  busy = `undo ${sha}`;
  try {
    const why = await ready(cfg);
    if (why) throw new Error(why);
    const res = await git(cfg, "revert", "--no-edit", sha);
    if (res.code !== 0) {
      await git(cfg, "revert", "--abort");
      throw new Error(`Couldn't undo it cleanly (later changes touch the same lines). Ask Claude to help.\n${(res.stderr || res.stdout).slice(0, 300)}`);
    }
    const revert = (await git(cfg, "rev-parse", "--short", "HEAD")).stdout.trim();
    writeFileSync(logFile(cfg), `${JSON.stringify(readLog(cfg).map((e) => (e.commit === sha ? { ...e, undone: revert } : e)), null, 2)}\n`);
    return { commit: revert, summary: `Undid “${entry.name}”.` };
  } finally {
    busy = null;
  }
}

/** The applied log, newest first, and which save is being applied right now. */
export const appliedLog = (cfg) => ({ log: readLog(cfg).slice(0, 40), busy });
