// Apply: the helper writes saves into the project's code, on one branch, one commit per save.
//
//   palette  Deterministic: the changed scale steps are written into the tokens file, the
//            contrast script is re-run (a failing pairing stops the apply and puts the file
//            back) and its table is regenerated.
//   design   Claude Code writes the variation into the component's stylesheet.
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

// ---- palette: deterministic

async function applyPalette(cfg, save, untrackedBefore) {
  const a = cfg.apply;
  const tokensPath = join(a.repo, a.tokens);
  const before = readFileSync(tokensPath, "utf8");
  let css = before;
  let count = 0;
  const expected = Object.values(save.scales ?? {}).reduce((n, steps) => n + Object.keys(steps).length, 0);
  for (const [prefix, steps] of Object.entries(save.scales ?? {})) {
    if (!/^--[a-z][\w-]*$/.test(prefix)) throw new Error(`Odd scale name ${prefix}.`);
    for (const [step, hex] of Object.entries(steps)) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex) || !/^\d+$/.test(step)) throw new Error(`Odd value ${prefix}-${step}: ${hex}.`);
      const re = new RegExp(`(^\\s*${prefix}-${step}\\s*:\\s*)#[0-9A-Fa-f]{6}(\\s*;)`, "m");
      if (re.test(css)) {
        css = css.replace(re, `$1${hex.toUpperCase()}$2`);
        count++;
      }
    }
  }
  if (count !== expected) throw new Error(`Found ${count} of ${expected} scale steps in ${a.tokens}; nothing changed.`);
  // The brand's anchor colour is named in the file's comments too: keep them true.
  const oldAnchor = save.was?.["--brand"]?.["800"];
  const newAnchor = save.scales?.["--brand"]?.["800"];
  if (oldAnchor && newAnchor) css = css.replaceAll(oldAnchor.toUpperCase(), newAnchor.toUpperCase());
  writeFileSync(tokensPath, css);

  const files = [a.tokens];
  if (a.contrastScript) {
    const res = await run("python3", [a.contrastScript], a.repo);
    if (res.code !== 0) {
      writeFileSync(tokensPath, before);
      const fails = res.stdout.split("\n").filter((l) => /fail|✗|below/i.test(l)).slice(0, 6).join("\n");
      throw new Error(`The palette fails the app's contrast check, so it wasn't applied.${fails ? `\n${fails}` : ""}`);
    }
    if (a.contrastDoc) {
      writeFileSync(join(a.repo, a.contrastDoc), res.stdout);
      files.push(a.contrastDoc);
    }
  }
  const changed = await changedFiles(cfg, untrackedBefore);
  const sha = await commit(cfg, changed.filter((f) => files.includes(f)), `Palette: ${save.name} (brand ${newAnchor ?? "unchanged"})`);
  return { commit: sha, files, summary: `Wrote ${count} colour steps into ${a.tokens}${a.contrastDoc ? " and refreshed the contrast table" : ""}.` };
}

// ---- design and page edits: Claude Code

const designPrompt = (save, json) => `You are applying a design variation that the designer tried live in the running app and chose to keep. Here is the save:

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

const pagePrompt = (save, json) => `You are applying edits the designer made in the running app with the in-browser toolbar. Here is the save:

\`\`\`json
${json}
\`\`\`

Each edit has a CSS selector, the components it sits in ("source": a file and approximate line when known, then "in A < B < C"), its tag and classes, and what changed:
- newText / html: the words changed from wasText. Change the string in the JSX (or the copy file it comes from) so it says newText. Keep any markup inside it.
- color / fill: a text or background colour picked from the app's palette. Use the matching role token (var(--color-…) / var(--surface-…)) in the component's stylesheet; the swatch hexes match the tokens in web/src/styles/tokens.css. Never write raw hex.
- fontSize (px) / type (a type style: title, status, tab, value, body, heading, small, lcd) / scale: write it into the component's stylesheet using the app's font tokens.
- removed: take the element out of the JSX only if it's clearly decorative or redundant; otherwise leave it and say so.

Find each element by its components and classes (Grep web/src). Change only files under web/src/. Don't touch tokens.css. Keep each file's style.

When done, reply with one or two plain sentences saying what changed, and anything you left alone and why.`;

async function applyWithClaude(cfg, kind, save, untrackedBefore) {
  const json = JSON.stringify(save, null, 2).slice(0, 60_000);
  const prompt = kind === "design" ? designPrompt(save, json) : pagePrompt(save, json);
  const allowed = kind === "design" ? ["web/src/styles/**"] : ["web/src/**"];
  const answer = await claudeEdits(cfg, prompt);
  const changed = await changedFiles(cfg, untrackedBefore);
  if (!answer.ok) {
    await putBack(cfg, changed, untrackedBefore);
    throw new Error(answer.error);
  }
  if (!changed.length) throw new Error(answer.summary || "Claude didn't change anything.");
  const outside = changed.filter((f) => !within(f, allowed) || f === cfg.apply.tokens);
  if (outside.length) {
    await putBack(cfg, changed, untrackedBefore);
    throw new Error(`Claude changed files it shouldn't (${outside.join(", ")}), so nothing was kept.`);
  }
  const broken = await typecheck(cfg, changed);
  if (broken) {
    await putBack(cfg, changed, untrackedBefore);
    throw new Error(`The change didn't type-check, so nothing was kept:\n${broken}`);
  }
  const title = kind === "design" ? `Design: ${save.name} (${save.target?.label})` : `Page edits: ${save.page} (${save.edits?.length ?? 0} change${save.edits?.length === 1 ? "" : "s"})`;
  const sha = await commit(cfg, changed, title);
  return { commit: sha, files: changed, summary: answer.summary };
}

// ---- the queue

let busy = null;

/**
 * Apply one save. kind: "palette" | "design" | "page"; file: the save's file in editsDir.
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
    const result = kind === "palette" ? await applyPalette(cfg, save, untrackedBefore) : await applyWithClaude(cfg, kind, save, untrackedBefore);
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
