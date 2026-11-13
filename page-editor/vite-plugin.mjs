// Dev-server half of the page editor (editor.ts), as a Vite plugin:
//
//   import { pageEditor } from "web-tools/page-editor/vite-plugin.mjs";
//   export default defineConfig({ plugins: [pageEditor({ facts: ["src/content.ts"] })] });
//
// <endpoint>/edits   Save posts the live edits here; they are written to <editsDir>/<page>.json
//                    for Claude to make permanent. GET ?page= reports which save Claude has
//                    finished (Claude writes <page>.applied.json with that save's savedAt).
// <endpoint>/rewrite The Rewrite tool: text, its context and the mood go to Claude with the
//                    brief as instructions, and options come back. Claude is reached through
//                    the Claude Code CLI (`claude -p`, the user's own sign-in, no API key). If
//                    that fails, the request is left in <editsDir> for an open Claude Code
//                    session to answer (see README).
//
// Dev only: `apply: "serve"`, so nothing of this ends up in a build.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BRIEF = join(HERE, "briefs", "default.md");
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
    "This is one pass over the page's headings. Write them as a set: across the set, vary the shape",
    "(a plain fact, a number, a first-person line, a short label, a small moment) so no two headings",
    "in your first options share a formula, and the page doesn't read as one template repeated.",
    "Put your strongest option for each heading first. Answer with the same ids.",
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
    `Write ${per} options for each heading. Give one diagnosis sentence for the set as it stands.`,
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
function askCli(cfg, system, prompt, schema) {
  return new Promise((resolve) => {
    const args = ["-p", prompt, "--model", cfg.model, "--effort", cfg.effort, "--tools", "", "--no-session-persistence", "--output-format", "json", "--system-prompt", system, "--json-schema", JSON.stringify(schema)];
    let out = "";
    let err = "";
    let child;
    try {
      child = spawn(claudeBin(), args, { cwd: tmpdir(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
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

async function rewrite(cfg, req) {
  const system = briefFrom(cfg.brief);
  const set = req.mode === "headings";
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
 * @param {object} [options]
 * @param {string} [options.endpoint="/__page-editor"] Must match mountEditor's `endpoint`.
 * @param {string} [options.editsDir="page-edits"] Where saves and session requests go (relative to the Vite root). Keep it out of git.
 * @param {string} [options.brief] The rewrite instructions (Markdown). Default: briefs/default.md.
 * @param {string[]} [options.facts=[]] Files with the page's facts and numbers, sent with every rewrite.
 * @param {string} [options.model] Claude model. Default: claude-opus-5-5 (or PAGE_EDITOR_MODEL).
 * @param {string} [options.effort="medium"] low | medium | high.
 * @param {boolean} [options.sessionFallback=true] If the CLI fails, wait for an open Claude Code session to answer.
 */
export function pageEditor(options = {}) {
  const endpoint = (options.endpoint ?? "/__page-editor").replace(/\/$/, "");
  const cfg = {
    editsDir: "",
    brief: DEFAULT_BRIEF,
    facts: [],
    model: options.model ?? process.env.PAGE_EDITOR_MODEL ?? "claude-opus-5-5",
    effort: options.effort ?? "medium",
    sessionFallback: options.sessionFallback ?? true,
    sessionWaitMs: SESSION_WAIT_MS,
  };
  return {
    name: "page-editor",
    apply: "serve",
    configResolved(config) {
      const at = (p) => (isAbsolute(p) ? p : resolve(config.root, p));
      cfg.editsDir = at(options.editsDir ?? "page-edits");
      if (options.brief) cfg.brief = at(options.brief);
      cfg.facts = (options.facts ?? []).map(at);
    },
    configureServer(server) {
      const OUT = cfg.editsDir;
      server.middlewares.use(`${endpoint}/rewrite`, (req, res) => {
        const reply = (code, body) => {
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
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
          const empty = data.mode === "headings" ? !(Array.isArray(data.items) && data.items.length) : !clip(data.text, 600);
          if (empty) return reply(400, { error: "No text to rewrite." });
          try {
            const answer = await rewrite(cfg, data);
            reply(answer.error ? 502 : 200, answer);
          } catch (e) {
            reply(500, { error: String(e?.message ?? e) });
          }
        });
      });
      server.middlewares.use(`${endpoint}/edits`, (req, res) => {
        const reply = (code, body) => {
          res.statusCode = code;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        // GET ?page=long → which save Claude has finished applying (it writes <page>.applied.json).
        if (req.method === "GET") {
          const page = new URL(req.url ?? "", "http://x").searchParams.get("page") ?? "";
          const file = join(OUT, `${page}.applied.json`);
          if (!/^[a-z0-9-]{1,40}$/.test(page) || !existsSync(file)) return reply(200, { applied: null });
          try {
            return reply(200, { applied: JSON.parse(readFileSync(file, "utf8")).savedAt ?? null });
          } catch {
            return reply(200, { applied: null });
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
            reply(200, { file: join(OUT, `${page}.json`), edits: data.edits.length });
          } catch {
            reply(400, { error: "not JSON" });
          }
        });
      });
    },
  };
}
