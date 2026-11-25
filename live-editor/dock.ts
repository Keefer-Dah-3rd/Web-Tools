/**
 * The dock: one small launcher for the design tools, out of the app's way, with shortcuts.
 *
 *   ⌥E  the edit toolbar      ⌥C  Colour Lab      ⌥D  Design Generator      ⌥T  Texture Lab
 *   ⌥H  hide every tool
 *
 * Shortcuts use Option (Alt) so they don't collide with an app's own single keys; they match by
 * physical key (⌥C types "ç" on a Mac). ⌥H hides every tool, outlines and all, for a clean look
 * at the app; press it again (or click the dock's dot) to bring them back as they were.
 *
 * Docked: every tool opens in the same left-hand slot, one at a time (opening one folds the
 * others), fixed in place above the dock.
 *
 * ⌘Z / ⌘⇧Z go to the tool you last used (clicked in, or picking on the page with); when you last
 * clicked the app itself, they're the app's own undo and redo, untouched.
 */

/** What the dock needs to open and fold a panel. */
export interface PanelControl {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export interface DockTool {
  /** Short label on the dock. */
  label: string;
  /** The tool's host element id (for ⌘Z routing), e.g. "colour-lab". */
  host?: string;
  /** One glyph before the label. */
  icon: string;
  /** Physical key for the ⌥ shortcut, e.g. "KeyC". */
  code: string;
  control: PanelControl;
}

export interface DockOptions {
  tools: DockTool[];
  /** Where the dock sits. Default: bottom left, 8px in. */
  position?: Partial<Record<"left" | "right" | "top" | "bottom", string>>;
  storagePrefix: string;
}

const STYLE = `
:host { all: initial; }
.dock { position: fixed; z-index: 2147483500; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 999px;
  background: rgba(22, 25, 31, 0.92); border: 1px solid rgba(255, 255, 255, 0.16); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
  font: 600 11px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; color: #e9edf3; letter-spacing: 0.02em; }
button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 5px; padding: 5px 9px; border-radius: 999px; white-space: nowrap; }
button:hover { background: rgba(255, 255, 255, 0.1); }
button.on { background: rgba(255, 255, 255, 0.16); color: #fff; }
button:focus-visible { outline: 2px solid #3ea0ff; outline-offset: 1px; }
.dot { width: 9px; height: 9px; padding: 5px; }
.dot i { display: block; width: 9px; height: 9px; border-radius: 50%; background: #3ea0ff; box-shadow: 0 0 0 3px rgba(62,160,255,.22); }
.dock.hiding .dot i { background: #5b6472; box-shadow: none; }
.dock.hiding button:not(.dot) { display: none; }
kbd { font: 600 9.5px ui-monospace, Menlo, monospace; color: #8e9aab; }
`;

let mounted = false;

export function mountDock(options: DockOptions): void {
  if (mounted || document.getElementById("design-dock")) return;
  mounted = true;
  const host = document.createElement("div");
  host.id = "design-dock";
  host.setAttribute("data-review-tool", "");
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const pos = options.position ?? { left: "8px", bottom: "6px" };
  const place = Object.entries(pos).map(([k, v]) => `${k}:${v}`).join(";");
  const editorHost = () => document.getElementById("live-editor");
  const hideKey = `${options.storagePrefix}:dock:hidden`;
  const editorKey = `${options.storagePrefix}:dock:editor`;

  const items: (DockTool & { host: string })[] = [
    { label: "Edit", icon: "✎", code: "KeyE", host: "live-editor", control: {
      open: () => { const h = editorHost(); if (h) h.style.display = ""; remember(editorKey, true); },
      close: () => {
        const h = editorHost();
        if (h) h.style.display = "none";
        remember(editorKey, false);
        window.dispatchEvent(new CustomEvent("review-tool:close", { detail: "live-editor" }));
      },
      isOpen: () => (editorHost()?.style.display ?? "none") !== "none",
    } },
    ...options.tools.map((t) => ({ ...t, host: t.host ?? "" })),
  ];
  // Every tool sits in the docked slot on the left.
  for (const el of document.querySelectorAll<HTMLElement>("[data-review-tool]")) if (el !== host) el.setAttribute("data-docked", "");

  /** The tool ⌘Z belongs to: the one last clicked in, or "app". */
  let owner = "app";
  const toolOf = (e: Event) => {
    for (const n of e.composedPath()) if (n instanceof HTMLElement && n.hasAttribute("data-review-tool") && n !== host) return n.id;
    return null;
  };
  document.addEventListener(
    "pointerdown",
    (e) => {
      const tool = toolOf(e);
      if (tool) owner = tool;
      else if (editorHost()?.hasAttribute("data-active")) owner = "live-editor"; // picking on the page
      else if (!(e.composedPath() as Node[]).includes(host)) owner = "app";
    },
    true,
  );

  root.innerHTML = `<style>${STYLE}</style><div class="dock" style="${place}">
    <button class="dot" data-act="hide" title="Hide every tool (⌥H)"><i></i></button>
    ${items.map((t, i) => `<button data-tool="${i}" title="${t.label} (⌥${t.code.replace(/^Key/, "")})">${t.icon} ${t.label} <kbd>⌥${t.code.replace(/^Key/, "")}</kbd></button>`).join("")}
  </div>`;
  const dock = root.querySelector<HTMLElement>(".dock")!;

  function remember(key: string, value: boolean) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* fine */
    }
  }
  const recall = (key: string, fallback: boolean) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as boolean);
    } catch {
      return fallback;
    }
  };

  /** Every other tool on the page (toolbar, panels, outlines), for Hide. */
  const toolHosts = () => [...document.querySelectorAll<HTMLElement>("[data-review-tool]")].filter((el) => el !== host);
  let hidden = false;
  const setHidden = (hide: boolean) => {
    hidden = hide;
    for (const el of toolHosts()) el.style.visibility = hide ? "hidden" : "";
    // A hidden tool still changes the page (edits, palettes, variations stay on): that's the point.
    dock.classList.toggle("hiding", hide);
    remember(hideKey, hide);
    render();
  };

  const render = () => {
    root.querySelectorAll<HTMLElement>("[data-tool]").forEach((b) => b.classList.toggle("on", !hidden && items[Number(b.dataset.tool)].control.isOpen()));
  };

  const toggle = (i: number) => {
    if (hidden) setHidden(false);
    const t = items[i].control;
    if (t.isOpen()) t.close();
    else {
      // One tool in the slot at a time.
      items.forEach((other, j) => j !== i && other.control.isOpen() && other.control.close());
      t.open();
      owner = items[i].host || owner;
    }
    render();
  };

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-act=hide]")) setHidden(!hidden);
    const i = t.closest<HTMLElement>("[data-tool]")?.dataset.tool;
    if (i != null) toggle(Number(i));
  });
  document.addEventListener(
    "keydown",
    (e) => {
      // ⌘Z / ⌘⇧Z: to the tool you last used, unless you're typing in one of its fields (the field undoes).
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === "KeyZ") {
        const typing = e.composedPath().some((n) => n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement || (n instanceof HTMLElement && n.isContentEditable));
        const tool = items.find((t) => t.host && t.host === owner && t.control.isOpen());
        if (!tool || typing || hidden) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent("review-tool:history", { detail: { target: tool.host, redo: e.shiftKey } }));
        return;
      }
      if (!e.altKey || e.metaKey || e.ctrlKey || e.repeat) return;
      if (e.code === "KeyH") setHidden(!hidden);
      else {
        const i = items.findIndex((t) => t.code === e.code);
        if (i < 0) return;
        toggle(i);
      }
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  // Panels open and fold themselves too (and fold for each other): keep the dock's lights true.
  window.addEventListener("review-tool:open", () => window.setTimeout(render, 0));
  root.addEventListener("pointerenter", render);

  if (!recall(editorKey, true)) items[0].control.close();
  // Only one tool in the slot: keep the first one that's open.
  const firstOpen = items.findIndex((t) => t.control.isOpen());
  items.forEach((t, j) => j !== firstOpen && t.control.isOpen() && t.control.close());
  if (recall(hideKey, false)) window.setTimeout(() => setHidden(true), 0);
  render();
}
