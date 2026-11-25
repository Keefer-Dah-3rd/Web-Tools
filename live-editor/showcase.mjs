// The showcase: design variations saved to show the team, without touching the app's code.
//
// Each save is a folder in <showcaseDir> (default <editsDir>/showcase):
//   screenshot.png   the whole tab with the variation on, exactly as it looked
//   part.png         a close-up of the part it restyles (not for whole-app variations)
//   variation.css    the CSS, ready to paste: scoped to the part, plus anything else that was on the page
//   variation.json   everything needed to put it back on the live app (the "Show it live" link uses it)
// and <showcaseDir>/index.html is rebuilt on every save: a gallery you can double-click open,
// zip up or send, no helper or app needed to look at it.
//
//   POST <endpoint>/showcase           {record, screenshot?, part?} (PNG data URLs)  -> {id}
//   GET  <endpoint>/showcase           the saves, newest first
//   GET  <endpoint>/showcase/<id>      one save's variation.json
//   GET  /showcase                     the gallery page (and /showcase/<id>/<file> its images)
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ID = /^[a-z0-9-]{4,80}$/;
const FILES = new Set(["screenshot.png", "part.png", "variation.css", "variation.json"]);

export const showcaseDir = (cfg) => cfg.showcaseDir ?? join(cfg.editsDir, "showcase");

const clip = (v, n) => String(v ?? "").slice(0, n);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const reply = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
};

function readJson(req, max) {
  return new Promise((ok, fail) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > max) {
        fail(new Error("That's too big to save."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(raw));
      } catch {
        fail(new Error("not JSON"));
      }
    });
  });
}

const png = (dataUrl) => {
  const m = String(dataUrl ?? "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  return m ? Buffer.from(m[1], "base64") : null;
};

/** Every save, newest first (the ones whose variation.json reads). */
export function listShowcase(cfg) {
  const dir = showcaseDir(cfg);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((id) => ID.test(id) && existsSync(join(dir, id, "variation.json")))
    .map((id) => {
      try {
        const r = JSON.parse(readFileSync(join(dir, id, "variation.json"), "utf8"));
        return { ...r, id, hasScreenshot: existsSync(join(dir, id, "screenshot.png")), hasPart: existsSync(join(dir, id, "part.png")) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

/** The link that puts a save back on the live app: its own page, with ?showcase=<id>. */
function liveLink(r) {
  try {
    const u = new URL(r.url);
    u.searchParams.set("tools", "");
    u.searchParams.set("showcase", r.id);
    return u.toString().replace("tools=&", "tools&");
  } catch {
    return "";
  }
}

function cssFile(r) {
  const head = [
    `/* ${r.name}`,
    ` * ${r.why}`,
    ` * Asked for: ${r.ask || "(nothing written)"}`,
    ` * Part: ${r.target?.label} (${r.target?.scope === "app" ? "the whole app" : r.target?.scope === "all" ? "every one like it" : "just this one"})${r.target?.source ? `, ${r.target.source}` : ""}`,
    ` * Page: ${r.url}`,
    ` * Saved ${r.savedAt}. A design to show, not in the app's code: it sits on top of the app's own styles. */`,
  ].join("\n");
  const extra = r.alsoOnPage ? `\n\n/* Also on the page when it was saved (a Colour Lab preview): */\n${r.alsoOnPage}` : "";
  return `${head}\n\n${r.cssApplied}${extra}\n`;
}

/** The gallery: one self-contained page next to the saves (images by relative path). */
export function buildIndex(cfg) {
  const items = listShowcase(cfg);
  const fmt = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const cards = items
    .map((r) => {
      const link = liveLink(r);
      const scope = r.target?.scope === "app" ? "Whole app" : r.target?.scope === "all" ? `Every ${esc(r.target?.label)}` : esc(r.target?.label);
      return `<article id="${esc(r.id)}">
  ${r.hasScreenshot ? `<a class="shot" href="${esc(r.id)}/screenshot.png" target="_blank"><img src="${esc(r.id)}/screenshot.png" alt="${esc(r.name)}, the whole screen" loading="lazy"></a>` : `<div class="shot none">No screenshot (the capture was cancelled). The code below rebuilds it.</div>`}
  <div class="text">
    <h2>${esc(r.name)}</h2>
    <p class="why">${esc(r.why)}</p>
    <dl>
      ${r.ask ? `<dt>Asked for</dt><dd>${esc(r.ask)}</dd>` : ""}
      <dt>Part</dt><dd>${scope}${r.target?.source ? ` <small>${esc(r.target.source)}</small>` : ""}</dd>
      <dt>Saved</dt><dd>${esc(fmt(r.savedAt))}${r.by ? ` by ${esc(r.by)}` : ""}</dd>
      ${r.note ? `<dt>Note</dt><dd>${esc(r.note)}</dd>` : ""}
    </dl>
    ${r.hasPart ? `<a class="part" href="${esc(r.id)}/part.png" target="_blank"><img src="${esc(r.id)}/part.png" alt="Close-up of ${esc(r.target?.label)}" loading="lazy"></a>` : ""}
    <div class="links">
      ${link ? `<a class="live" href="${esc(link)}">Show it live ↗</a>` : ""}
      <a href="${esc(r.id)}/variation.css" target="_blank">The CSS</a>
      <a href="${esc(r.id)}/variation.json" target="_blank">Everything (JSON)</a>
    </div>
    <details><summary>Code</summary><pre>${esc(cssFile(r))}</pre></details>
  </div>
</article>`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design showcase</title>
<style>
  :root { color-scheme: dark; --line: rgba(255,255,255,.12); --muted: #9aa6b6; --accent: #b48cff; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #111318; color: #e9edf3; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; }
  header { padding: 40px 32px 8px; max-width: 1280px; margin: 0 auto; }
  h1 { margin: 0; font-size: 28px; letter-spacing: -0.01em; }
  header p { color: var(--muted); margin: 6px 0 0; max-width: 70ch; }
  main { padding: 24px 32px 64px; max-width: 1280px; margin: 0 auto; display: grid; gap: 28px; }
  article { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); gap: 24px; padding: 20px; border: 1px solid var(--line); border-radius: 16px; background: #171a21; }
  .shot img { width: 100%; display: block; border-radius: 10px; border: 1px solid var(--line); }
  .shot.none { display: grid; place-items: center; min-height: 220px; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); padding: 20px; text-align: center; }
  h2 { margin: 0 0 4px; font-size: 20px; }
  .why { margin: 0 0 14px; color: #c8d2df; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0 0 14px; font-size: 13.5px; }
  dt { color: var(--muted); } dd { margin: 0; } dd small { color: var(--muted); }
  .part img { max-width: 100%; max-height: 220px; display: block; border-radius: 8px; border: 1px solid var(--line); margin-bottom: 14px; }
  .links { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .links a { color: inherit; text-decoration: none; padding: 7px 12px; border-radius: 8px; border: 1px solid var(--line); font-size: 13px; font-weight: 600; min-height: 36px; display: inline-flex; align-items: center; }
  .links a:hover { border-color: var(--accent); }
  .links a.live { background: var(--accent); color: #12071f; border-color: var(--accent); }
  details summary { cursor: pointer; color: var(--muted); font-size: 13px; }
  pre { margin: 8px 0 0; max-height: 320px; overflow: auto; font: 12px/1.45 ui-monospace, "SF Mono", Menlo, monospace; background: #0c0e12; padding: 12px; border-radius: 8px; white-space: pre-wrap; }
  .empty { color: var(--muted); }
  @media (max-width: 820px) { article { grid-template-columns: 1fr; } header, main { padding-left: 16px; padding-right: 16px; } }
</style>
<header><h1>Design showcase</h1>
<p>${items.length} design variation${items.length === 1 ? "" : "s"} saved to show, none of them in the app's code. Each has the screen as it looked, a close-up of the part, and the CSS that makes it. <b>Show it live</b> puts it back on the running app (needs the app and the tools helper running).</p></header>
<main>${cards || `<p class="empty">Nothing saved yet. In the Design Generator, show a variation and press 📸 Save to showcase.</p>`}</main>
</html>
`;
  mkdirSync(showcaseDir(cfg), { recursive: true });
  writeFileSync(join(showcaseDir(cfg), "index.html"), html);
}

/** POST: save one variation (record + screenshots) as a new folder, then rebuild the gallery. */
export async function handleShowcaseSave(cfg, req, res) {
  if (req.method !== "POST") return reply(res, 405, { error: "POST only" });
  try {
    const data = await readJson(req, 40_000_000);
    const r = data?.record;
    if (!r || typeof r.css !== "string" || !r.css.trim() || !r.target?.selector) return reply(res, 400, { error: "No variation to save." });
    const slug = clip(r.name, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "design";
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    const dir = showcaseDir(cfg);
    let id = `${stamp}-${slug}`;
    for (let n = 2; existsSync(join(dir, id)); n++) id = `${stamp}-${slug}-${n}`;
    const record = {
      id,
      name: clip(r.name, 120),
      why: clip(r.why, 1000),
      ask: clip(r.ask, 1000),
      note: clip(r.note, 1000),
      savedAt: new Date().toISOString(),
      url: clip(r.url, 1000),
      viewport: r.viewport,
      target: {
        selector: clip(r.target.selector, 600),
        scope: ["all", "one", "app"].includes(r.target.scope) ? r.target.scope : "one",
        count: Number(r.target.count) || 1,
        label: clip(r.target.label, 200),
        source: clip(r.target.source, 300),
        canvas: !!r.target.canvas,
      },
      css: clip(r.css, 200_000),
      cssApplied: clip(r.cssApplied, 220_000),
      alsoOnPage: clip(r.alsoOnPage, 200_000),
      howToRebuild:
        "Open the page at url with ?tools&showcase=<id> and the Design Generator puts it back on. By hand: add cssApplied (and alsoOnPage, if any) as a <style> at the end of <head>. css is nested CSS where & is the part named by target.selector.",
    };
    const shot = png(data.screenshot);
    const part = png(data.part);
    mkdirSync(join(dir, id), { recursive: true });
    writeFileSync(join(dir, id, "variation.json"), `${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(join(dir, id, "variation.css"), cssFile(record));
    if (shot) writeFileSync(join(dir, id, "screenshot.png"), shot);
    if (part) writeFileSync(join(dir, id, "part.png"), part);
    buildIndex(cfg);
    reply(res, 200, { id, folder: join(dir, id), gallery: join(dir, "index.html"), screenshot: !!shot });
  } catch (e) {
    reply(res, 400, { error: String(e?.message ?? e) });
  }
}

/** GET the list (no id) or one save's record; DELETE <id> removes that save. */
export function handleShowcase(cfg, id, req, res) {
  if (req.method === "DELETE" && id && ID.test(id)) {
    const dir = join(showcaseDir(cfg), id);
    if (!existsSync(join(dir, "variation.json"))) return reply(res, 404, { error: "No such save." });
    rmSync(dir, { recursive: true, force: true });
    buildIndex(cfg);
    return reply(res, 200, { ok: true });
  }
  if (req.method !== "GET") return reply(res, 405, { error: "GET only" });
  const all = listShowcase(cfg);
  if (!id) return reply(res, 200, { items: all.map(({ css, cssApplied, alsoOnPage, ...rest }) => rest) });
  const one = all.find((r) => r.id === id);
  return one ? reply(res, 200, one) : reply(res, 404, { error: "No such save." });
}

/** GET /showcase and /showcase/<id>/<file>: the gallery page and its files. */
export function serveShowcaseFile(cfg, rest, res) {
  const dir = showcaseDir(cfg);
  let file = null;
  let type = "text/html; charset=utf-8";
  if (!rest || rest === "index.html") {
    if (!existsSync(join(dir, "index.html"))) buildIndex(cfg);
    file = join(dir, "index.html");
  } else {
    const [id, name] = rest.split("/");
    if (ID.test(id ?? "") && FILES.has(name ?? "")) {
      file = join(dir, id, name);
      type = { png: "image/png", css: "text/css; charset=utf-8", json: "application/json" }[name.split(".").pop()];
    }
  }
  if (!file || !existsSync(file)) {
    res.statusCode = 404;
    return res.end("Not found");
  }
  res.setHeader("content-type", type);
  res.setHeader("cache-control", "no-store");
  res.end(readFileSync(file));
}
