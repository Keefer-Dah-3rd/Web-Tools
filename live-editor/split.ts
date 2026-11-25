/**
 * Side by side: the open tool gets its own full-height pane on the right of the window, and the
 * page shrinks to the space on the left, so nothing of the app sits under a tool.
 *
 * Drag the divider between them to give either side more room (double-click it for the default
 * split). The split is kept as a share of the window, so it follows the window as it gets wider
 * or narrower; below MIN_APP + MIN_PANE the window is too small to split and the tool floats over
 * the page as before.
 *
 * How the page is narrowed: its <body> gets the app's width, the site's own full-viewport rules
 * (`width: 100vw`) are pointed at that width, and window.innerWidth reports it too (apps clamp
 * popovers to it), with a resize event so the app re-measures. The page stays at x = 0, so its
 * own fixed-position popovers still line up with what they point at.
 */

const MIN_PANE = 300;
const MIN_APP = 380;
const DEFAULT_SHARE = 0.3;
const STYLE_ID = "tools-split-page";
const PANE_STYLE_ID = "tools-split-pane";

/** CSS for a tool's shadow root: its panel fills the pane. */
const PANE_CSS = `
:host([data-split]) .panel, :host([data-split]) .bar {
  left: auto !important; right: 0 !important; top: 0 !important; bottom: 0 !important;
  width: var(--tools-split-pane-w, 360px) !important; height: 100vh !important; max-height: none !important;
  border-radius: 0 !important; border-width: 0 !important; box-shadow: none !important;
  background: rgb(22, 25, 31) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important;
}
:host([data-split]) .head { cursor: default !important; }
/* Wider pane, more cards per row. */
:host([data-split]) .grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important; }
`;

export interface SplitOptions {
  storagePrefix: string;
  /** Page rules that size things to the viewport (e.g. ".app-shell"), to size to the app instead. */
  viewportWide?: string[];
  /** Tool hosts on the page (shadow hosts) that hold the panels. */
  toolHosts: () => HTMLElement[];
}

export interface Split {
  /** Turn the split on or off for the current state: a tool open, tools shown, side-by-side chosen. */
  sync(toolOpen: boolean): void;
  /** Side by side (true) or floating over the page (false). */
  setSideBySide(on: boolean): void;
  sideBySide(): boolean;
  /** The divider element, for the dock to place in its own shadow root. */
  divider: HTMLElement;
}

export function createSplit(options: SplitOptions): Split {
  const shareKey = `${options.storagePrefix}:split:share`;
  const modeKey = `${options.storagePrefix}:split:on`;
  const read = <T,>(key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* fine */
    }
  };

  let share = read<number>(shareKey, DEFAULT_SHARE);
  let side = read<boolean>(modeKey, true);
  let active = false;
  let wantOpen = false;
  let paneW = 0;

  // window.innerWidth as the browser reports it, before we narrow it.
  const own = Object.getOwnPropertyDescriptor(window, "innerWidth");
  const realWidth = (): number => (own?.get ? (own.get.call(window) as number) : document.documentElement.clientWidth);
  let patched = false;
  const patchInnerWidth = (on: boolean) => {
    try {
      if (on && !patched) {
        Object.defineProperty(window, "innerWidth", { configurable: true, get: () => realWidth() - (active ? paneW : 0) });
        patched = true;
      } else if (!on && patched && own) {
        Object.defineProperty(window, "innerWidth", own);
        patched = false;
      }
    } catch {
      /* the page still splits; popovers just clamp to the full window */
    }
  };

  const pageStyle = () => {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      el.setAttribute("data-review-tool-style", "");
      document.head.appendChild(el);
    }
    return el;
  };
  const wide = (options.viewportWide ?? []).map((s) => `html[data-tools-split] ${s}`).join(", ");
  const PAGE_CSS = `
html[data-tools-split] { overflow: hidden !important; }
html[data-tools-split] body { width: var(--tools-split-app-w) !important; min-width: 0 !important; max-width: var(--tools-split-app-w) !important; overflow: hidden !important; }
${wide ? `${wide} { width: var(--tools-split-app-w) !important; max-width: var(--tools-split-app-w) !important; }` : ""}
`;

  const dressPanes = () => {
    for (const host of options.toolHosts()) {
      const root = host.shadowRoot;
      if (!root) continue;
      if (!root.getElementById(PANE_STYLE_ID)) {
        const s = document.createElement("style");
        s.id = PANE_STYLE_ID;
        s.textContent = PANE_CSS;
        root.appendChild(s);
      }
      host.toggleAttribute("data-split", active);
    }
  };

  const divider = document.createElement("div");
  divider.className = "split-divider";
  divider.title = "Drag to share the window between the app and the tools (double-click resets)";
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-orientation", "vertical");
  divider.tabIndex = 0;
  divider.hidden = true;

  const widthFor = (vw: number) => Math.round(Math.min(Math.max(share * vw, MIN_PANE), vw - MIN_APP));

  let resizeQueued = false;
  const announce = () => {
    // Tell the app the window changed (it re-measures and re-clamps), once per frame.
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      window.dispatchEvent(new Event("resize"));
    });
  };

  const apply = () => {
    const vw = realWidth();
    const fits = vw >= MIN_APP + MIN_PANE;
    const next = side && wantOpen && fits;
    const nextW = next ? widthFor(vw) : 0;
    if (next === active && nextW === paneW) return;
    active = next;
    paneW = nextW;
    const html = document.documentElement;
    if (active) {
      pageStyle().textContent = PAGE_CSS;
      html.style.setProperty("--tools-split-pane-w", `${paneW}px`);
      html.style.setProperty("--tools-split-app-w", `${vw - paneW}px`);
      html.setAttribute("data-tools-split", "");
      divider.style.left = `${vw - paneW - 4}px`;
      divider.setAttribute("aria-valuenow", String(Math.round((paneW / vw) * 100)));
      divider.hidden = false;
      patchInnerWidth(true);
    } else {
      html.removeAttribute("data-tools-split");
      html.style.removeProperty("--tools-split-pane-w");
      html.style.removeProperty("--tools-split-app-w");
      divider.hidden = true;
      patchInnerWidth(false);
    }
    dressPanes();
    announce();
  };

  // Dragging the divider.
  divider.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      divider.setPointerCapture(e.pointerId);
    } catch {
      /* moves still arrive while the pointer stays on the divider */
    }
    divider.classList.add("dragging");
    let frame = 0;
    const move = (ev: PointerEvent) => {
      const vw = realWidth();
      share = Math.min(Math.max((vw - ev.clientX) / vw, MIN_PANE / vw), (vw - MIN_APP) / vw);
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; apply(); });
    };
    const up = (ev: PointerEvent) => {
      move(ev);
      cancelAnimationFrame(frame);
      frame = 0;
      apply();
      divider.classList.remove("dragging");
      divider.removeEventListener("pointermove", move);
      divider.removeEventListener("pointerup", up);
      divider.removeEventListener("pointercancel", up);
      write(shareKey, share);
    };
    divider.addEventListener("pointermove", move);
    divider.addEventListener("pointerup", up);
    divider.addEventListener("pointercancel", up);
  });
  divider.addEventListener("dblclick", () => {
    share = DEFAULT_SHARE;
    write(shareKey, share);
    apply();
  });
  divider.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === "ArrowLeft") share += step;
    else if (e.key === "ArrowRight") share -= step;
    else return;
    e.preventDefault();
    const vw = realWidth();
    share = Math.min(Math.max(share, MIN_PANE / vw), (vw - MIN_APP) / vw);
    write(shareKey, share);
    apply();
  });

  // The window got wider or narrower: keep the same share. Our own resize events are skipped.
  let last = realWidth();
  window.addEventListener("resize", () => {
    const vw = realWidth();
    if (vw === last) return;
    last = vw;
    apply();
  });

  return {
    divider,
    sync(toolOpen) {
      wantOpen = toolOpen;
      apply();
    },
    setSideBySide(on) {
      side = on;
      write(modeKey, on);
      apply();
    },
    sideBySide: () => side,
  };
}
