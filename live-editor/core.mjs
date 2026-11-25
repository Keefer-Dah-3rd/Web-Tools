// The live editor's server half (used by server.mjs): the page editor's endpoints, plus
// per-page briefs and facts for a site with many pages.
//
// <endpoint>/edits   Save posts the live edits here; they are written to <editsDir>/<page>.json
//                    for Claude to make permanent. GET ?page= reports which save Claude has
//                    finished (Claude writes <page>.applied.json with that save's savedAt).
// <endpoint>/rewrite The Rewrite tool: text, its context and the mood go to Claude with the
//                    brief as instructions, and options come back. Claude is reached through
//                    the Claude Code CLI (`claude -p`, the user's own sign-in, no API key). If
//                    that fails, the request is left in <editsDir> for an open Claude Code
//                    session to answer (see README).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applySave } from "./apply.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BRIEF = join(HERE, "..", "page-editor", "briefs", "default.md");
const SESSION_WAIT_MS = 4 * 60_000;

const SCHEMA = {
  type: "object",
  properties: {
    diagnosis: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, why: { type: "string" } },
        required: ["text", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["diagnosis", "options"],
  additionalProperties: false,
};

/** The headings pass: every heading rewritten together, a few options each. */
const SET_SCHEMA = {
  type: "object",
  properties: {
    diagnosis: { type: "string" },
    headings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          options: SCHEMA.properties.options,
        },
        required: ["id", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["diagnosis", "headings"],
  additionalProperties: false,
};

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const list = (value, max, each) => (Array.isArray(value) ? value.slice(0, max).map((v) => clip(v, each)).filter(Boolean) : []);

/** The brief, minus its human-facing header (everything above the first ---). */
const briefFrom = (file) => {
  const text = readFileSync(file, "utf8");
  const cut = text.indexOf("\n---\n");
  return cut >= 0 ? text.slice(cut + 5).trim() : text;
};

/** The project's facts files, as the only source of numbers and claims. */
function factsBlock(cfg) {
  if (!cfg.facts.length) return ["## Page facts", "(none given: use only what the page text says)"];
  const out = ["## Page facts (the only source for numbers and claims)"];
  let room = 24000;
  for (const file of cfg.facts) {
    if (!existsSync(file) || room <= 0) continue;
    const text = readFileSync(file, "utf8").slice(0, room);
    room -= text.length;
    out.push(`### ${file.split("/").pop()}`, "```", text, "```");
  }
  return out;
}

function setPromptFor(cfg, req) {
  const per = Math.min(5, Math.max(2, Number(req.count) || 3));
  const mood = list(req.chips, 12, 40);
  const words = clip(req.mood, 400);
  const items = (Array.isArray(req.items) ? req.items : []).slice(0, 24);
  return [
    ...factsBlock(cfg),
    "",
    "## Every heading on the page, top to bottom",
    ...list(req.headings, 40, 120).map((h) => `- ${h}`),
    "",
    "## Rewrite these together",
    items.length === 1
      ? "One block of text the author picked on the page."
      : `${items.length} blocks of text the author picked on the page. Write them as a set: across the set, vary the shape (a plain fact, a number, a first-person line, a short label, a small moment) so no two of your first options share a formula, and the page doesn't read as one template repeated.`,
    "Match each block's role: a heading stays heading-length; a paragraph stays a paragraph of",
    "about the same length, keeping every fact it states, unless the mood asks for Shorter.",
    "Put your strongest option for each block first. Answer with the same ids.",
    "",
    ...items.map((it) =>
      [
        `### id: ${clip(it.id, 20)}`,
        `Role: ${clip(it.role, 80)}`,
        `Section text: ${clip(it.nearby, 700) || "(none)"}`,
        `Current text: "${clip(it.text, 300)}"`,
        it.original && clip(it.original, 300) !== clip(it.text, 300) ? `Original text: "${clip(it.original, 300)}"` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "",
    "## Mood",
    mood.length ? `Picked: ${mood.join(", ")}` : "Picked: (nothing)",
    words ? `In their words: "${words}"` : "",
    "",
    `Write ${per} options for each block. Give one diagnosis sentence for what's there now; call blocks "block 1", "block 2" (their id numbers), never by id.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function promptFor(cfg, req) {
  const count = Math.min(8, Math.max(3, Number(req.count) || 5));
  const mood = list(req.chips, 12, 40);
  const words = clip(req.mood, 400);
  const avoid = list(req.avoid, 30, 200);
  return [
    ...factsBlock(cfg),
    "",
    "## Headings on the page right now",
    ...list(req.headings, 40, 120).map((h) => `- ${h}`),
    "",
    "## What to rewrite",
    `Role: ${clip(req.role, 80)}`,
    `Section it sits in: ${clip(req.section, 160) || "(none)"}`,
    `Text around it: ${clip(req.nearby, 1200) || "(none)"}`,
    `Current text: "${clip(req.text, 600)}"`,
    req.original && clip(req.original, 600) !== clip(req.text, 600) ? `Original text, before any edits: "${clip(req.original, 600)}"` : "",
    "",
    "## Mood",
    mood.length ? `Picked: ${mood.join(", ")}` : "Picked: (nothing)",
    words ? `In their words: "${words}"` : "",
    avoid.length ? ["", "## Already suggested (don't repeat or echo)", ...avoid.map((a) => `- ${a}`)].join("\n") : "",
    "",
    `Write ${count} options.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const claudeBin = () => {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const local = join(homedir(), ".local", "bin", "claude");
  return existsSync(local) ? local : "claude";
};

/** One headless Claude Code call: no tools, no session saved, run outside the repo so no project files load. */
/**
 * opts.readDir: let Claude read files in that one folder (images to look at), and nothing else:
 * the Read tool only, restricted mode, no MCP servers.
 */
function askCli(cfg, system, prompt, schema, opts = {}) {
  return new Promise((resolve) => {
    const tools = opts.readDir ? ["--tools", "Read", "--restricted", "--strict-mcp-config", "--add-dir", opts.readDir] : ["--tools", ""];
    const args = ["-p", prompt, "--model", cfg.model, "--effort", cfg.effort, ...tools, "--no-session-persistence", "--output-format", "json", "--system-prompt", system, "--json-schema", JSON.stringify(schema)];
    let out = "";
    let err = "";
    let child;
    try {
      // Never an API key: rewrites use the Claude sign-in, so they can't bill Console credits.
      const { ANTHROPIC_API_KEY: _key, ...env } = process.env;
      child = spawn(claudeBin(), args, { cwd: tmpdir(), env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      return resolve({ ok: false, auth: false, error: `Couldn't start Claude Code: ${e.message}` });
    }
    const timer = setTimeout(() => child.kill("SIGTERM"), 180_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, auth: false, error: `Couldn't start Claude Code: ${e.message}` });
    });
    child.on("close", () => {
      clearTimeout(timer);
      let data;
      try {
        data = JSON.parse(out);
      } catch {
        return resolve({ ok: false, auth: /auth|log ?in|oauth/i.test(err), error: clip(err || out || "No answer from Claude Code.", 300) });
      }
      if (data.is_error || !data.structured_output) {
        const why = clip(data.result || err || "Claude Code returned no options.", 300);
        return resolve({ ok: false, auth: /auth|log ?in|oauth|credential/i.test(why), error: why });
      }
      resolve({ ok: true, answer: data.structured_output });
    });
  });
}

/** Fallback: leave the request for an open Claude Code session (it watches concepts/edits/) and wait for its answer. */
async function askSession(cfg, system, prompt, schema) {
  const OUT = cfg.editsDir;
  mkdirSync(OUT, { recursive: true });
  for (const name of readdirSync(OUT)) if (/^rewrite-.*\.(request|answer)\.json$/.test(name)) unlinkSync(join(OUT, name));
  const id = Date.now().toString(36);
  const request = join(OUT, `rewrite-${id}.request.json`);
  const answer = join(OUT, `rewrite-${id}.answer.json`);
  writeFileSync(request, `${JSON.stringify({ id, answerFile: answer, schema, system, prompt }, null, 2)}\n`);
  const until = Date.now() + cfg.sessionWaitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
    if (!existsSync(answer)) continue;
    try {
      const data = JSON.parse(readFileSync(answer, "utf8"));
      unlinkSync(answer);
      if (existsSync(request)) unlinkSync(request);
      return { ok: true, answer: data };
    } catch {
      /* half-written: try again */
    }
  }
  if (existsSync(request)) unlinkSync(request);
  return { ok: false, error: "No Claude Code session answered." };
}

async function rewrite(site, req) {
  // A page can have its own brief and facts (config "pages"), else the site's.
  const cfg = { ...site, ...(site.pages?.[String(req.page ?? "")] ?? {}) };
  const system = briefFrom(cfg.brief);
  const set = req.mode === "set" || req.mode === "headings";
  const prompt = set ? setPromptFor(cfg, req) : promptFor(cfg, req);
  const schema = set ? SET_SCHEMA : SCHEMA;
  const cli = await askCli(cfg, system, prompt, schema);
  if (cli.ok) return { ...cli.answer, via: "Claude Code" };
  if (!cfg.sessionFallback) return { error: cli.auth ? "Claude Code isn't signed in. Run `claude auth login` in Terminal once." : cli.error };
  const session = await askSession(cfg, system, prompt, schema);
  if (session.ok) return { ...session.answer, via: "Claude session" };
  const hint = cli.auth
    ? "Claude Code isn't signed in. Run `claude auth login` in Terminal once, or keep a Claude session open."
    : `${cli.error} No Claude session answered either.`;
  return { error: hint };
}

/**
 * The settings both servers share, with paths resolved against `base`.
 * @param {object} options See pageEditor() in vite-plugin.mjs.
 * @param {string} base Folder that relative paths are read from.
 */
export function configFor(options, base) {
  const at = (p) => (isAbsolute(p) ? p : resolve(base, p));
  return {
    editsDir: at(options.editsDir ?? "page-edits"),
    brief: options.brief ? at(options.brief) : DEFAULT_BRIEF,
    paletteBrief: options.paletteBrief ? at(options.paletteBrief) : null,
    designBrief: options.designBrief ? at(options.designBrief) : null,
    designFacts: (options.designFacts ?? []).map(at),
    // Writing saves into the project's code (apply.mjs): the project folder and its branch.
    apply: options.apply ? { ...options.apply, repo: at(options.apply.repo) } : null,
    facts: (options.facts ?? []).map(at),
    model: options.model ?? process.env.PAGE_EDITOR_MODEL ?? "claude-opus-5-5",
    effort: options.effort ?? "medium",
    sessionFallback: options.sessionFallback ?? true,
    sessionWaitMs: SESSION_WAIT_MS,
    pages: Object.fromEntries(
      Object.entries(options.pages ?? {}).map(([id, page]) => [
        id,
        { ...(page.brief ? { brief: at(page.brief) } : {}), ...(page.facts ? { facts: page.facts.map(at) } : {}) },
      ]),
    ),
  };
}

const replyWith = (res) => (code, body) => {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

/** POST <endpoint>/rewrite (Node req/res, as Vite's middleware and node:http both give). */
export function handleRewrite(cfg, req, res) {
  const reply = replyWith(res);
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 200_000) req.destroy();
  });
  req.on("end", async () => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return reply(400, { error: "not JSON" });
    }
    const empty = data.mode === "set" || data.mode === "headings" ? !(Array.isArray(data.items) && data.items.length) : !clip(data.text, 600);
    if (empty) return reply(400, { error: "No text to rewrite." });
    try {
      const answer = await rewrite(cfg, data);
      reply(answer.error ? 502 : 200, answer);
    } catch (e) {
      reply(500, { error: String(e?.message ?? e) });
    }
  });
}

/** GET <endpoint>/edits?page= (which save is applied) and POST <endpoint>/edits (a save). */
export function handleEdits(cfg, req, res) {
  const reply = replyWith(res);
  const OUT = cfg.editsDir;
  // GET ?page=long → which save Claude has finished applying (it writes <page>.applied.json).
  if (req.method === "GET") {
    const page = new URL(req.url ?? "", "http://x").searchParams.get("page") ?? "";
    const file = join(OUT, `${page}.applied.json`);
    const failed = join(OUT, `${page}.apply-error.json`);
    let error = null;
    try {
      if (/^[a-z0-9-]{1,40}$/.test(page) && existsSync(failed)) error = JSON.parse(readFileSync(failed, "utf8"));
    } catch {
      error = null;
    }
    if (!/^[a-z0-9-]{1,40}$/.test(page) || !existsSync(file)) return reply(200, { applied: null, error });
    try {
      return reply(200, { applied: JSON.parse(readFileSync(file, "utf8")).savedAt ?? null, error });
    } catch {
      return reply(200, { applied: null, error });
    }
  }
  if (req.method !== "POST") return reply(405, { error: "GET or POST only" });
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 2_000_000) req.destroy();
  });
  req.on("end", () => {
    try {
      const data = JSON.parse(raw);
      const page = String(data.page ?? "");
      if (!/^[a-z0-9-]{1,40}$/.test(page) || !Array.isArray(data.edits)) return reply(400, { error: "bad payload" });
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `${page}.json`), `${JSON.stringify(data, null, 2)}\n`);
      const failed = join(OUT, `${page}.apply-error.json`);
      if (existsSync(failed)) unlinkSync(failed);
      reply(200, { file: join(OUT, `${page}.json`), edits: data.edits.length, applying: !!cfg.apply?.autoPage });
      // Write the edits into the code in the background; the toolbar reloads once <page>.applied.json says so.
      if (cfg.apply?.autoPage && data.edits.length) {
        applySave(cfg, "page", `${page}.json`).catch((e) =>
          writeFileSync(failed, `${JSON.stringify({ savedAt: data.savedAt, message: String(e?.message ?? e) })}\n`),
        );
      }
    } catch {
      reply(400, { error: "not JSON" });
    }
  });
}

// ---- Colour Lab (colour/lab.ts): palettes from a mood, and saving a chosen palette.

const PALETTE_SCHEMA = {
  type: "object",
  properties: {
    palettes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          seed: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          harmony: { type: "string", enum: ["keep", "complementary", "split", "analogous", "triad", "mono"] },
          casingFollow: { type: "boolean" },
          casingTint: { type: "number" },
          displays: { type: "boolean" },
          displayTint: { type: "number" },
          accents: { type: "boolean" },
          tracks: { type: "boolean" },
          vividness: { type: "number" },
          why: { type: "string" },
        },
        required: ["name", "seed", "harmony", "casingFollow", "casingTint", "displays", "displayTint", "accents", "tracks", "vividness", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["palettes"],
  additionalProperties: false,
};

function palettePrompt(req) {
  const hexes = (v) => (Array.isArray(v) ? v.slice(0, 13).map((h) => clip(h, 9)).join(" ") : "(none)");
  return [
    "## Mood",
    `In their words: "${clip(req.mood, 400)}"`,
    "",
    "## The app now",
    `Brand scale as designed, 50 → 999 (step 800 = ${clip(req.original?.seed, 9)}): ${hexes(req.original?.brand)}`,
    `Casing scale as designed, 50 → 999: ${hexes(req.original?.casing)}`,
    "",
    "## In the lab right now",
    `Seed ${clip(req.current?.seed, 9)}, harmony ${clip(req.current?.harmony, 20)}, casing tint ${Number(req.current?.casingTint ?? 1)}`,
    `Theme scope now: displays ${req.current?.displays ? `on (tint ${Number(req.current?.displayTint ?? 1)})` : "off"}, accents ${req.current?.accents ? "on" : "off"}, tracks ${req.current?.tracks ? "on" : "off"}, vividness ${Number(req.current?.vividness ?? 1)}`,
    `Brand scale it gives: ${hexes(req.current?.brand)}`,
    list(req.kept, 24, 9).length ? `Already kept (don't repeat): ${list(req.kept, 24, 9).join(", ")}` : "",
    "",
    "Suggest 3 palettes.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function palette(cfg, req) {
  if (!cfg.paletteBrief) return { error: "This site has no palette brief (paletteBrief in its config)." };
  const system = briefFrom(cfg.paletteBrief);
  const refs = referencesBlock(cfg, req.references, "palette");
  const prompt = palettePrompt(req) + refs.text;
  const cli = await askCli(cfg, system, prompt, PALETTE_SCHEMA, refs.images ? { readDir: inspirationDir(cfg) } : {});
  if (cli.ok) return { ...cli.answer, via: "Claude Code" };
  if (!cfg.sessionFallback) return { error: cli.auth ? "Claude Code isn't signed in. Run `claude auth login` in Terminal once." : cli.error };
  const session = await askSession(cfg, system, prompt, PALETTE_SCHEMA);
  if (session.ok) return { ...session.answer, via: "Claude session" };
  return { error: `${cli.error} No Claude session answered either.` };
}

/** Read a JSON body (up to `max` bytes), then hand it to `then`. */
function jsonBody(req, res, max, then) {
  const reply = replyWith(res);
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > max) req.destroy();
  });
  req.on("end", async () => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return reply(400, { error: "not JSON" });
    }
    try {
      await then(data, reply);
    } catch (e) {
      reply(500, { error: String(e?.message ?? e) });
    }
  });
}

/** POST <endpoint>/palette: a mood in, three palettes (seed, harmony, casing) out. */
export function handlePalette(cfg, req, res) {
  jsonBody(req, res, 100_000, async (data, reply) => {
    if (!clip(data.mood, 400)) return reply(400, { error: "Describe a mood first." });
    const answer = await palette(cfg, data);
    reply(answer.error ? 502 : 200, answer);
  });
}

/** POST <endpoint>/palette-save: the chosen palette, written to <editsDir>/palette-<name>.json for Claude. */
export function handlePaletteSave(cfg, req, res) {
  jsonBody(req, res, 500_000, (data, reply) => {
    if (!data || typeof data.scales !== "object" || !Object.keys(data.scales).length) return reply(400, { error: "No changed scales to save." });
    const slug = clip(data.name, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "palette";
    mkdirSync(cfg.editsDir, { recursive: true });
    const file = join(cfg.editsDir, `palette-${slug}.json`);
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    reply(200, { file, name: `palette-${slug}.json`, canApply: !!cfg.apply });
  });
}

// ---- Design Generator (design/generator.ts): CSS variations of one part, and saving one.

const DESIGN_SCHEMA = {
  type: "object",
  properties: {
    diagnosis: { type: "string" },
    variants: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, why: { type: "string" }, css: { type: "string" } },
        required: ["name", "why", "css"],
        additionalProperties: false,
      },
    },
  },
  required: ["diagnosis", "variants"],
  additionalProperties: false,
};

/** The design brief plus the site's design facts (its design-language guide), as the system prompt. */
function designSystem(cfg) {
  const parts = [briefFrom(cfg.designBrief)];
  let room = 30000;
  for (const file of cfg.designFacts ?? []) {
    if (!existsSync(file) || room <= 0) continue;
    const text = readFileSync(file, "utf8").slice(0, room);
    room -= text.length;
    parts.push(`## Design facts: ${file.split("/").slice(-2).join("/")}\n\n${text}`);
  }
  return parts.join("\n\n");
}

function designPrompt(req) {
  const t = req.target ?? {};
  const raw = (v, max) => String(v ?? "").slice(0, max);
  return [
    "## What the designer asked",
    `"${clip(req.ask, 600)}"`,
    "",
    "## The part",
    t.scope === "app"
      ? "THE WHOLE APP (selector :root, so & is :root). Restyle it through the shared role tokens (set them on &) and rules for the most-used parts listed below (& .class)."
      : `${clip(t.label, 120)}: ${t.scope === "all" ? `every one like it (${Number(t.count) || 1} on screen), selector ${clip(t.selector, 200)}` : `just this one, selector ${clip(t.selector, 400)}`}`,
    t.source ? `Component: ${clip(t.source, 200)}` : "",
    t.canvas ? "It contains a canvas: CSS can style its frame and the HTML around it, not what is drawn inside." : "",
    `Viewport: ${Number(req.viewport?.width) || 0}×${Number(req.viewport?.height) || 0}`,
    "",
    req.inventory ? ["## What's on screen: the most-used parts (class ×count “sample words”: computed style)", raw(req.inventory, 16000)].join("\n") : ["## Its markup (trimmed)", raw(req.markup, 7000)].join("\n"),
    "",
    req.inventory ? "## The page body's computed style" : "## Its computed style",
    raw(req.computed, 1500),
    Array.isArray(req.children) && req.children.length ? ["", "## Its direct children (computed)", ...req.children.slice(0, 6).map((c) => `- ${raw(c, 700)}`)].join("\n") : "",
    "",
    "## The app's CSS rules that style it now",
    raw(req.rules, 14000) || "(none found)",
    "",
    "## Tokens you may use (name: value now)",
    raw(req.tokens, 16000),
    list(req.locked, 40, 60).length
      ? ["", "## Read-only tokens", `Tailwind's theme sets these over the app's own at runtime, so changing them can't reach the screen. Use them if you like; never set them: ${list(req.locked, 40, 60).join(", ")}`].join("\n")
      : "",
    list(req.protect, 12, 40).length
      ? ["", "## Never touch", `The mascot keeps exactly the look it has now (its own design system comes later). Write nothing whose selector mentions ${list(req.protect, 12, 40).join(", ")}, nothing that targets canvas, and nothing on & that could change how the mascot looks (filters, zoom, opacity on ancestors).`].join("\n")
      : "",
    list(req.avoid, 12, 200).length ? ["", "## Already shown (go somewhere different)", ...list(req.avoid, 12, 200).map((a) => `- ${a}`)].join("\n") : "",
    "",
    "Write 3 variations.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function design(cfg, req) {
  if (!cfg.designBrief) return { error: "This site has no design brief (designBrief in its config)." };
  const system = designSystem(cfg);
  const refs = referencesBlock(cfg, req.references, "design");
  const prompt = designPrompt(req) + refs.text;
  const cli = await askCli(cfg, system, prompt, DESIGN_SCHEMA, refs.images ? { readDir: inspirationDir(cfg) } : {});
  if (cli.ok) return { ...cli.answer, via: "Claude Code" };
  if (!cfg.sessionFallback) return { error: cli.auth ? "Claude Code isn't signed in. Run `claude auth login` in Terminal once." : cli.error };
  const session = await askSession(cfg, system, prompt, DESIGN_SCHEMA);
  if (session.ok) return { ...session.answer, via: "Claude session" };
  return { error: `${cli.error} No Claude session answered either.` };
}

/** POST <endpoint>/design: a picked part and an ask in, three CSS variations out. */
export function handleDesign(cfg, req, res) {
  jsonBody(req, res, 400_000, async (data, reply) => {
    if (!clip(data.ask, 600)) return reply(400, { error: "Say what to try first." });
    if (!clip(data.target?.selector, 400)) return reply(400, { error: "Pick a part first." });
    const answer = await design(cfg, data);
    reply(answer.error ? 502 : 200, answer);
  });
}

/** POST <endpoint>/design-save: the chosen variation, written to <editsDir>/design-<name>.json for Claude. */
export function handleDesignSave(cfg, req, res) {
  jsonBody(req, res, 200_000, (data, reply) => {
    if (!data || typeof data.css !== "string" || !data.css.trim() || !data.target?.selector) return reply(400, { error: "No variation to save." });
    const slug = clip(data.name, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "design";
    mkdirSync(cfg.editsDir, { recursive: true });
    const file = join(cfg.editsDir, `design-${slug}.json`);
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
    reply(200, { file, name: `design-${slug}.json`, canApply: !!cfg.apply });
  });
}

// ---- writing saves into the code (apply.mjs)

/** POST <endpoint>/apply {kind: "palette" | "design", name}: write a save into the code and commit it. */
export function handleApply(cfg, req, res) {
  jsonBody(req, res, 10_000, async (data, reply) => {
    if (!["palette", "design"].includes(data.kind)) return reply(400, { error: "Only palettes and designs apply from here." });
    const { applySave } = await import("./apply.mjs");
    try {
      reply(200, await applySave(cfg, data.kind, String(data.name ?? "")));
    } catch (e) {
      reply(409, { error: String(e?.message ?? e) });
    }
  });
}

/** POST <endpoint>/undo {commit}: revert one commit the helper made. */
export function handleUndo(cfg, req, res) {
  jsonBody(req, res, 10_000, async (data, reply) => {
    const { undoApply } = await import("./apply.mjs");
    try {
      reply(200, await undoApply(cfg, String(data.commit ?? "")));
    } catch (e) {
      reply(409, { error: String(e?.message ?? e) });
    }
  });
}

/** GET <endpoint>/applied: what the helper has written into the code lately, and what it's doing now. */
export async function handleApplied(cfg, req, res) {
  const { appliedLog } = await import("./apply.mjs");
  replyWith(res)(200, cfg.apply ? appliedLog(cfg) : { log: [], busy: null });
}

// ---- inspiration images for the Design Generator

const inspirationDir = (cfg) => join(cfg.editsDir, "inspiration");
const IMAGE_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

const ASPECT_WORDS = {
  colour: "colour", typography: "typography", "type-layout": "type layout", box: "box style (shapes, borders, corners)", cards: "card design",
  buttons: "buttons", dropdowns: "dropdowns and menus", inputs: "inputs and toggles", controls: "knobs and sliders", icons: "icons",
  spacing: "spacing and density", depth: "depth and shadows", texture: "texture and materials", layout: "layout and grid",
  navigation: "tabs and navigation", data: "meters and charts", imagery: "imagery and illustration", mood: "overall mood",
};
const aspectWords = (list) => {
  const words = (Array.isArray(list) ? list : []).map((a) => ASPECT_WORDS[a]).filter(Boolean);
  return words.length ? words.join(", ") : "everything about it";
};

/** The saved image for an id, as an absolute path, or null. */
function imageFile(cfg, id) {
  if (!/^[a-f0-9]{16}$/.test(String(id))) return null;
  const dir = inspirationDir(cfg);
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((n) => n.startsWith(`${id}.`));
  return f ? join(dir, f) : null;
}

/**
 * The designer's references as a prompt section: each image (and the zoomed crop of every box
 * on it) with what to learn from it, and each marked part of the app with its styles.
 */
function referencesBlock(cfg, refs, use) {
  if (!Array.isArray(refs) || !refs.length) return { text: "", images: 0 };
  const lines = [];
  let images = 0;
  refs.slice(0, 6).forEach((ref, i) => {
    const n = i + 1;
    const note = clip(ref.note, 300);
    if (ref.kind === "image") {
      const file = imageFile(cfg, ref.id);
      if (!file) return;
      images++;
      lines.push(`Reference ${n}: an image, ${file}`);
      const regions = Array.isArray(ref.regions) ? ref.regions.slice(0, 8) : [];
      if (!regions.length || (Array.isArray(ref.aspects) && ref.aspects.length)) lines.push(`  From the whole image, learn: ${aspectWords(ref.aspects)}.${note ? ` The designer says: "${note}"` : ""}`);
      regions.forEach((r, j) => {
        const crop = imageFile(cfg, r.cropId);
        const b = r.box ?? {};
        const pct = (v) => Math.round(Number(v) * 100);
        const where = `x ${pct(b.x)}–${pct(b.x + b.w)}%, y ${pct(b.y)}–${pct(b.y + b.h)}% of the image`;
        const rNote = clip(r.note, 300);
        if (crop) images++;
        lines.push(`  Box ${String.fromCharCode(65 + j)} (${where}${crop ? `; zoomed crop: ${crop}` : ""}): learn ${aspectWords(r.aspects?.length ? r.aspects : ref.aspects)}.${rNote ? ` The designer says: "${rNote}"` : ""}`);
      });
    } else if (ref.kind === "app") {
      lines.push(`Reference ${n}: parts of this app the designer likes (${clip(ref.label, 120)}). Learn: ${aspectWords(ref.aspects)}.${note ? ` The designer says: "${note}"` : ""}`);
      lines.push(String(ref.styles ?? "").slice(0, 7000).replace(/^/gm, "  "));
    }
  });
  if (!lines.length) return { text: "", images: 0 };
  const how =
    use === "palette"
      ? "Read every image and crop listed, then let the colour in them (the parts marked for colour, or all of it where nothing is marked) shape the palettes: the seed, how warm or cool the casing is, how vivid the accents are. Say in each palette's why which reference it draws on."
      : "Read every image and crop listed before you write anything. From each reference learn only what the designer ticked (\"everything about it\" where nothing is ticked), and translate it into this app's tokens and parts: don't copy logos, words or exact layouts. In each variation's why, say which reference (and box) it draws on.";
  return { text: ["", "", "## References from the designer", how, "", ...lines].join("\n"), images };
}

/** POST <endpoint>/inspiration {dataUrl}: keep an image the designer added; answers its id. */
export function handleInspiration(cfg, req, res) {
  jsonBody(req, res, 12_000_000, async (data, reply) => {
    const m = String(data.dataUrl ?? "").match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return reply(400, { error: "That isn't a PNG, JPEG, WebP or GIF image." });
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 8_000_000) return reply(413, { error: "That image is over 8 MB." });
    const { createHash } = await import("node:crypto");
    const id = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const dir = inspirationDir(cfg);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.${IMAGE_TYPES[m[1]]}`), bytes);
    reply(200, { id });
  });
}

/** GET <endpoint>/inspiration/<id>: one kept image (the board's editor shows it large and crops it). */
export function serveInspiration(cfg, id, res) {
  const file = imageFile(cfg, id);
  if (!file) {
    res.statusCode = 404;
    return res.end("Not found");
  }
  const type = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" }[file.split(".").pop()] ?? "application/octet-stream";
  res.setHeader("content-type", type);
  res.setHeader("cache-control", "private, max-age=3600");
  res.end(readFileSync(file));
}
