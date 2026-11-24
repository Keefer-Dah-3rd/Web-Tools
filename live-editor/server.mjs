#!/usr/bin/env node
// The live editor's helper: runs on your Mac while you edit a published site.
//
//   node live-editor/server.mjs live-editor/sites/<site>.json      (npm run live)
//
// It does the dev server's job for a page that isn't served by Vite:
//   /editor.js          The toolbar, bundled from the project's entry file (rebuilt on each load).
//   /__page-editor/...  Saves and rewrites, exactly as in development (core.mjs).
//   /                   A page with the bookmark that loads the toolbar on the live site.
//
// The toolbar only ever appears for you: it isn't on the site, only your bookmark loads it,
// and the bookmark only works while this helper runs on your Mac.
//
// It listens on 127.0.0.1 only, and answers saves and rewrites only for the origins in the
// config (the live site), so other sites you visit can't use it.
//
// Config (JSON; paths are relative to the config file):
//   {
//     "entry": "site.ts",                  mounts the editor with the site's options
//     "origins": ["https://example.com"],  the live site
//     "port": 5199,
//     "editsDir": "edits", "brief": "rewrite-brief.md", "facts": ["src/facts.ts"],
//     "model": "...", "effort": "medium", "sessionFallback": true,
//     "pages": { "<page id>": { "brief": "...", "facts": ["..."] } }   optional, per page
//   }
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";
import { configFor, handleApplied, handleApply, handleInspiration, serveInspiration, handleDesign, handleDesignSave, handleEdits, handlePalette, handlePaletteSave, handleRewrite, handleUndo } from "./core.mjs";

const ENDPOINT = "/__page-editor";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node live-editor/server.mjs live-editor/sites/<site>.json");
  process.exit(1);
}
const configFile = resolve(file);
const base = dirname(configFile);
const options = JSON.parse(readFileSync(configFile, "utf8"));
const port = Number(options.port ?? 5199);
const origins = (options.origins ?? []).map((o) => o.replace(/\/$/, ""));
if (!options.entry) throw new Error(`${file}: "entry" is required (the file that calls mountEditor).`);
if (!origins.length) throw new Error(`${file}: "origins" is required (the live site, e.g. "https://example.com").`);
const entry = resolve(base, options.entry);
const cfg = configFor(options, base);
const here = `http://127.0.0.1:${port}`;

/** The toolbar bundle. The banner tells the editor where this helper is, so its saves come here. */
async function bundle() {
  const out = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2022",
    minify: false,
    sourcemap: "inline",
    banner: { js: `window.__pageEditorLive = { endpoint: ${JSON.stringify(here + ENDPOINT)} };` },
    logLevel: "silent",
  });
  return out.outputFiles[0].text;
}

const bookmarklet = `javascript:(()=>{if(window.__pageEditorLive)return;var s=document.createElement('script');s.src='${here}/editor.js?t='+Date.now();s.onerror=function(){alert('The live editor helper is not running. In Web-Tools: npm run live, then click the bookmark again.')};document.head.appendChild(s)})()`;

const helpPage = () => `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Live editor</title>
<style>
  body { font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; max-width: 620px; margin: 48px auto; padding: 0 16px; color: #1d1d1f; background: #fafaf8; }
  h1 { font-size: 24px; margin: 0 0 8px; }
  a.bm { display: inline-block; margin: 16px 0; padding: 10px 16px; border-radius: 10px; background: #ff5a1f; color: #fff; font-weight: 600; text-decoration: none; cursor: grab; }
  code { background: #eee; padding: 1px 5px; border-radius: 4px; font-size: 14px; }
  li { margin: 6px 0; }
</style>
<h1>The live editor helper is running</h1>
<p>It answers saves and rewrites from ${origins.map((o) => `<code>${o}</code>`).join(", ")}.</p>
<ol>
  <li>Drag this button to your bookmarks bar: <br><a class="bm" href="${bookmarklet.replace(/"/g, "&quot;")}">✎ Edit page</a></li>
  <li>Open a page of the site, signed in to its admin, and click <b>✎ Edit page</b> in the bookmarks bar.</li>
  <li>If Chrome asks whether the site may connect to devices on your local network, allow it. That's this helper.</li>
  <li>Edit, rewrite, then press <b>Save</b>. Claude applies the save to the code, publishes it, and the page reloads. Click the bookmark again to keep editing.</li>
</ol>
<p>Saves go to <code>${cfg.editsDir}</code>.</p>
`;

const allowed = (origin) => !origin || origins.includes(origin);

createServer(async (req, res) => {
  const origin = req.headers.origin;
  const path = (req.url ?? "/").split("?")[0];
  if (origin && origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    // Chrome asks before a public site may reach a server on this Mac (Private / Local Network Access).
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  if (req.method === "OPTIONS") {
    res.statusCode = allowed(origin) ? 204 : 403;
    return res.end();
  }
  if (path.startsWith(`${ENDPOINT}/`)) {
    if (!allowed(origin)) {
      res.statusCode = 403;
      return res.end(JSON.stringify({ error: `Not allowed from ${origin}` }));
    }
    if (path === `${ENDPOINT}/rewrite`) return handleRewrite(cfg, req, res);
    if (path === `${ENDPOINT}/edits`) return handleEdits(cfg, req, res);
    if (path === `${ENDPOINT}/palette`) return handlePalette(cfg, req, res);
    if (path === `${ENDPOINT}/palette-save`) return handlePaletteSave(cfg, req, res);
    if (path === `${ENDPOINT}/design`) return handleDesign(cfg, req, res);
    if (path === `${ENDPOINT}/design-save`) return handleDesignSave(cfg, req, res);
    if (path === `${ENDPOINT}/apply`) return handleApply(cfg, req, res);
    if (path === `${ENDPOINT}/undo`) return handleUndo(cfg, req, res);
    if (path === `${ENDPOINT}/applied`) return handleApplied(cfg, req, res);
    if (path === `${ENDPOINT}/inspiration`) return handleInspiration(cfg, req, res);
    if (path.startsWith(`${ENDPOINT}/inspiration/`) && req.method === "GET") return serveInspiration(cfg, path.slice(`${ENDPOINT}/inspiration/`.length), res);
  }
  if (path === "/editor.js") {
    try {
      const js = await bundle();
      res.setHeader("content-type", "text/javascript; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      return res.end(js);
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/javascript; charset=utf-8");
      return res.end(`console.error(${JSON.stringify(`Live editor failed to build: ${e.message}`)});`);
    }
  }
  if (path === "/") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.end(helpPage());
  }
  res.statusCode = 404;
  res.end("Not found");
}).listen(port, "127.0.0.1", () => {
  console.log(`Live editor helper: ${here}`);
  console.log(`  live site: ${origins.join(", ")}`);
  console.log(`  saves go to: ${cfg.editsDir}`);
  console.log(`Open ${here} for the bookmark.`);
});
