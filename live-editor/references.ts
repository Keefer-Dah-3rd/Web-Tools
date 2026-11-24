/**
 * The reference board: what the designer wants Claude to learn from. Two kinds of reference:
 *
 *   image  A picture added by file, drop or paste (a screenshot, a moodboard, a photo of hardware).
 *          Open it large and click-drag boxes around the parts worth learning from; each box gets
 *          its own checkboxes (colour, typography, cards …) and a note. Claude gets the whole image
 *          and a zoomed crop of every box.
 *   app    Parts of the running app itself, marked by click-dragging over them: Claude gets their
 *          classes, styles and CSS rules, with the same checkboxes.
 *
 * Nothing checked means "learn from everything in it". The helper keeps the images (and crops);
 * the browser keeps the board (thumbnails, boxes, checkboxes) under `<prefix>:references`, shared
 * by every tool on the page: the Colour Lab sends the ones marked for colour.
 */

export const ASPECTS: [string, string][] = [
  ["colour", "Colour"],
  ["typography", "Typography"],
  ["type-layout", "Type layout"],
  ["box", "Box style"],
  ["cards", "Cards"],
  ["buttons", "Buttons"],
  ["dropdowns", "Dropdowns & menus"],
  ["inputs", "Inputs & toggles"],
  ["controls", "Knobs & sliders"],
  ["icons", "Icons"],
  ["spacing", "Spacing & density"],
  ["depth", "Depth & shadows"],
  ["texture", "Texture & materials"],
  ["layout", "Layout & grid"],
  ["navigation", "Tabs & navigation"],
  ["data", "Meters & charts"],
  ["imagery", "Imagery & illustration"],
  ["mood", "Overall mood"],
];
const ASPECT_LABEL = Object.fromEntries(ASPECTS);

/** A box on an image, in fractions of the image (0–1). */
interface Region {
  box: { x: number; y: number; w: number; h: number };
  aspects: string[];
  note: string;
  /** The helper's id for this box's crop, when uploaded (cleared when the box moves). */
  cropId?: string;
}

interface ImageRef {
  kind: "image";
  /** The helper's id for the image. */
  id: string;
  thumb: string;
  aspects: string[];
  note: string;
  regions: Region[];
}

interface AppRef {
  kind: "app";
  label: string;
  /** The parts' classes, computed styles and CSS rules, as text for Claude. */
  styles: string;
  aspects: string[];
  note: string;
}

export type Reference = ImageRef | AppRef;

/** What a request carries to the helper. */
export type ReferencePayload =
  | { kind: "image"; id: string; aspects: string[]; note: string; regions: { cropId: string; box: Region["box"]; aspects: string[]; note: string }[] }
  | { kind: "app"; label: string; styles: string; aspects: string[]; note: string };

export interface BoardOptions {
  endpoint: string;
  storagePrefix: string;
  say: (text: string, err?: boolean) => void;
  /** Describe app elements for Claude: a short label and their styles and rules. */
  describeParts: (els: Element[]) => { label: string; styles: string };
  /** Called whenever the board changes (to re-render counts, say). */
  onChange?: () => void;
}

const MAX = 6;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const aspectsText = (a: string[]) => (a.length ? a.map((k) => ASPECT_LABEL[k] ?? k).join(" · ") : "everything");

/** Styles for the board inside a panel (the panel puts them in its own shadow root). */
export const BOARD_STYLE = `
.refs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.refs:empty { display: none; }
.ref { position: relative; display: grid; grid-template-rows: 64px auto; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.04); cursor: pointer; text-align: left; padding: 0; }
.ref:hover { border-color: #b48cff; }
.ref img { width: 100%; height: 64px; object-fit: cover; display: block; background: #000; }
.ref .app { height: 64px; display: grid; place-items: center; font-size: 22px; color: #d9c7ff; background: repeating-linear-gradient(45deg, rgba(180,140,255,.08) 0 6px, transparent 6px 12px); }
.ref .cap { padding: 4px 6px; font-size: 10px; line-height: 1.25; color: #c8d2df; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ref .marks { position: absolute; top: 4px; left: 4px; background: rgba(0,0,0,.7); border-radius: 999px; padding: 0 6px; font: 600 10px/16px ui-monospace, Menlo, monospace; color: #e2d4ff; }
.ref .x { position: absolute; top: 3px; right: 3px; padding: 0 5px; font-size: 10px; line-height: 16px; border-radius: 999px; background: rgba(0,0,0,.7); border: 1px solid rgba(255,255,255,.3); color: #fff; cursor: pointer; }
.ref.busy { opacity: .45; pointer-events: none; }
.drop.over { outline-color: #b48cff; background: rgba(180,140,255,.08); }
`;

const EDITOR_STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.shade { position: fixed; inset: 0; z-index: 2147483640; background: rgba(6, 7, 10, .55); }
.editor { position: fixed; left: 360px; top: 36px; right: 16px; bottom: 48px; z-index: 2147483641; display: grid; grid-template-columns: minmax(0, 1fr) 300px; grid-template-rows: auto minmax(0, 1fr);
  color: #e9edf3; font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  background: rgba(22, 25, 31, 0.97); border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 14px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6); overflow: hidden; }
@media (max-width: 900px) { .editor { left: 16px; } }
.top { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.1); }
.top b { font-size: 13px; }
.top span { color: #9aa6b6; flex: 1; }
button { font: inherit; color: inherit; cursor: pointer; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.07); padding: 6px 10px; font-weight: 600; }
button:hover { background: rgba(255, 255, 255, 0.13); }
button.primary { background: #b48cff; color: #12071f; border-color: #b48cff; }
.stage { position: relative; display: flex; align-items: center; justify-content: center; padding: 14px; min-height: 0; background: #0b0c10; }
.frame { position: relative; display: inline-block; max-width: 100%; max-height: 100%; cursor: crosshair; user-select: none; touch-action: none; }
.frame img { display: block; max-width: 100%; max-height: calc(100vh - 150px); pointer-events: none; }
.box { position: absolute; border: 2px solid #b48cff; background: rgba(180,140,255,.14); border-radius: 3px; }
.box.on { border-color: #ffd34d; background: rgba(255,211,77,.14); }
.box i { position: absolute; left: -2px; top: -20px; font: 700 11px/18px ui-monospace, Menlo, monospace; font-style: normal; background: #b48cff; color: #12071f; padding: 0 6px; border-radius: 4px; }
.box.on i { background: #ffd34d; }
.parts { padding: 18px; overflow: auto; display: grid; gap: 12px; align-content: start; }
.parts .what { font-size: 15px; font-weight: 700; color: #f3f6fa; }
.parts p { margin: 0; color: #aab5c3; }
.parts details summary { cursor: pointer; color: #9aa6b6; font-size: 11px; }
.parts pre { margin: 8px 0 0; font: 500 10.5px/1.45 ui-monospace, Menlo, monospace; color: #cfd8e3; white-space: pre-wrap; }
.side { border-left: 1px solid rgba(255,255,255,.1); overflow-y: auto; padding: 12px; display: grid; gap: 14px; align-content: start; }
h4 { margin: 0 0 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #9aa6b6; display: flex; gap: 8px; align-items: baseline; }
h4 em { margin-left: auto; font-style: normal; text-transform: none; letter-spacing: 0; color: #c8d2df; font-weight: 600; }
.checks { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px; }
.checks label { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #d5dce6; font-size: 11.5px; }
.checks input { accent-color: #b48cff; margin: 0; }
textarea { width: 100%; font: 500 12px/1.35 inherit; font-family: inherit; color: #f3f6fa; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 6px 8px; resize: vertical; min-height: 34px; margin-top: 6px; }
.region { border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 8px; }
.region.on { border-color: #ffd34d; }
.region h4 button { margin-left: auto; padding: 1px 7px; font-size: 10px; }
.hint { color: #8e9aab; font-size: 11px; margin: 0; }
.marquee-shade { position: fixed; inset: 0; z-index: 2147483640; cursor: crosshair; background: rgba(6,7,10,.18); }
.marquee { position: fixed; border: 2px dashed #b48cff; background: rgba(180,140,255,.12); border-radius: 3px; pointer-events: none; z-index: 2147483641; }
.marquee-tip { position: fixed; left: 50%; top: 44px; transform: translateX(-50%); z-index: 2147483642; background: rgba(22,25,31,.95); color: #e9edf3; padding: 8px 14px; border-radius: 999px; font: 600 12px -apple-system, sans-serif; border: 1px solid rgba(255,255,255,.2); pointer-events: none; }
`;

export class ReferenceBoard {
  private refs: Reference[];
  private uploading = 0;
  private container: HTMLElement | null = null;
  private readonly key: string;
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;

  constructor(private readonly opts: BoardOptions) {
    this.key = `${opts.storagePrefix}:references`;
    this.refs = this.load();
  }

  // ---- storage

  private load(): Reference[] {
    try {
      const refs = JSON.parse(localStorage.getItem(this.key) ?? "null") as Reference[] | null;
      if (refs) return refs;
      // Images added before the board existed become references that learn from everything.
      const old = JSON.parse(localStorage.getItem(`${this.opts.storagePrefix}:design:inspiration`) ?? "[]") as { id: string; thumb: string }[];
      return old.map((o) => ({ kind: "image", id: o.id, thumb: o.thumb, aspects: [], note: "", regions: [] }));
    } catch {
      return [];
    }
  }

  private save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.refs));
    } catch {
      this.opts.say("The browser couldn't keep the board (storage is full or blocked).", true);
    }
    this.render();
    this.opts.onChange?.();
  }

  get count() {
    return this.refs.length;
  }

  /** The references a request should carry (only those passing `keep`), crops uploaded first. */
  async payload(keep: (aspects: string[]) => boolean = () => true): Promise<ReferencePayload[]> {
    // Another tool on the page may have changed the board since this one loaded it.
    if (!this.container) this.refs = this.load();
    const out: ReferencePayload[] = [];
    for (const ref of this.refs) {
      if (ref.kind === "app") {
        if (keep(ref.aspects)) out.push({ kind: "app", label: ref.label, styles: ref.styles, aspects: ref.aspects, note: ref.note });
        continue;
      }
      const regions = ref.regions.filter((r) => keep(r.aspects.length ? r.aspects : ref.aspects));
      if (!keep(ref.aspects) && !regions.length) continue;
      for (const r of regions) if (!r.cropId) r.cropId = await this.crop(ref, r).catch(() => undefined);
      out.push({
        kind: "image",
        id: ref.id,
        aspects: ref.aspects,
        note: ref.note,
        regions: regions.filter((r) => r.cropId).map((r) => ({ cropId: r.cropId!, box: r.box, aspects: r.aspects, note: r.note })),
      });
    }
    this.save();
    return out;
  }

  /** Everything checked across the board (for "N references marked for colour"). */
  marked(aspect: string): number {
    if (!this.container) this.refs = this.load();
    return this.refs.filter((r) => !r.aspects.length || r.aspects.includes(aspect) || (r.kind === "image" && r.regions.some((g) => g.aspects.includes(aspect)))).length;
  }

  // ---- adding

  private async upload(dataUrl: string): Promise<string> {
    const res = await fetch(`${this.opts.endpoint}/inspiration`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl }) });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !data.id) throw new Error(data.error ?? `The helper answered ${res.status}.`);
    return data.id;
  }

  private shrink(src: string | Blob, edge: number, type = "image/jpeg"): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const url = typeof src === "string" ? src : URL.createObjectURL(src);
      img.onload = () => {
        const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        if (typeof src !== "string") URL.revokeObjectURL(url);
        resolve(c.toDataURL(type, 0.88));
      };
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = url;
    });
  }

  async addFiles(files: File[]) {
    const images = files.filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type));
    if (!images.length) return this.opts.say("Add PNG, JPEG, WebP or GIF images.", true);
    const room = MAX - this.refs.length - this.uploading;
    if (room <= 0) return this.opts.say(`${MAX} references at most: remove one first.`, true);
    const take = images.slice(0, room);
    this.uploading += take.length;
    this.render();
    for (const file of take) {
      try {
        const keepPng = file.type === "image/png" || file.type === "image/gif";
        const [full, thumb] = await Promise.all([this.shrink(file, 2000, keepPng ? "image/png" : "image/jpeg"), this.shrink(file, 240)]);
        const id = await this.upload(full);
        if (!this.refs.some((r) => r.kind === "image" && r.id === id)) this.refs.push({ kind: "image", id, thumb, aspects: [], note: "", regions: [] });
      } catch (e) {
        this.opts.say(`Couldn't add that image: ${(e as Error).message}`, true);
      } finally {
        this.uploading--;
      }
    }
    this.save();
    if (images.length > take.length) this.opts.say(`${MAX} references at most: the rest weren't added.`, true);
    else this.opts.say("Added. Click a reference to mark the parts you like and tick what to learn from them.");
  }

  /** The helper's copy of an image, as a URL the page can draw (the helper allows this origin). */
  private imageUrl(id: string) {
    return `${this.opts.endpoint}/inspiration/${id}`;
  }

  /** Upload a box's crop (zoomed to at most 1600px). */
  private async crop(ref: ImageRef, r: Region): Promise<string> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't load the image back from the helper."));
      i.src = this.imageUrl(ref.id);
    });
    const sx = r.box.x * img.naturalWidth;
    const sy = r.box.y * img.naturalHeight;
    const sw = Math.max(1, r.box.w * img.naturalWidth);
    const sh = Math.max(1, r.box.h * img.naturalHeight);
    const k = Math.min(1600 / Math.max(sw, sh), 4);
    const c = document.createElement("canvas");
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return this.upload(c.toDataURL("image/png"));
  }

  // ---- the board in the panel

  mount(container: HTMLElement) {
    this.container = container;
    container.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const drop = t.closest<HTMLElement>("[data-ref-drop]")?.dataset.refDrop;
      const open = t.closest<HTMLElement>("[data-ref]")?.dataset.ref;
      if (drop != null) {
        e.stopPropagation();
        this.refs.splice(Number(drop), 1);
        this.save();
      } else if (open != null) this.edit(Number(open));
    });
    this.render();
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML =
      this.refs
        .map((r, i) => {
          const marks = r.kind === "image" && r.regions.length ? `<span class="marks">${r.regions.length} box${r.regions.length === 1 ? "" : "es"}</span>` : "";
          const top = r.kind === "image" ? `<img src="${r.thumb}" alt="">` : `<div class="app">▦</div>`;
          const what = r.kind === "app" ? `${esc(r.label)} · ${aspectsText(r.aspects)}` : aspectsText([...new Set([...r.aspects, ...r.regions.flatMap((g) => g.aspects)])]);
          return `<button class="ref" data-ref="${i}" title="Click to mark parts and choose what to learn">${top}${marks}<span class="cap">${esc(what)}</span><span class="x" data-ref-drop="${i}" title="Remove">✕</span></button>`;
        })
        .join("") + Array.from({ length: this.uploading }, () => `<div class="ref busy"><div class="app">…</div><span class="cap">adding</span></div>`).join("");
  }

  // ---- the editor: a large view of one reference

  private ensureOverlay(): ShadowRoot {
    if (this.root) return this.root;
    this.host = document.createElement("div");
    this.host.id = "reference-editor";
    this.host.setAttribute("data-review-tool", "");
    document.documentElement.appendChild(this.host);
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${EDITOR_STYLE}</style><div class="layer"></div>`;
    // Keep the app's shortcuts out while the editor is up.
    this.root.addEventListener("keydown", (e) => e.stopPropagation());
    return this.root;
  }

  private checks(name: string, chosen: string[]) {
    return `<div class="checks">${ASPECTS.map(([k, label]) => `<label><input type="checkbox" data-aspect="${name}" value="${k}" ${chosen.includes(k) ? "checked" : ""}>${label}</label>`).join("")}</div>`;
  }

  edit(index: number) {
    const ref = this.refs[index];
    if (!ref) return;
    const root = this.ensureOverlay();
    const layer = root.querySelector<HTMLElement>(".layer")!;
    let selected = ref.kind === "image" && ref.regions.length ? 0 : -1;
    const close = () => {
      layer.innerHTML = "";
      document.removeEventListener("keydown", onKey, true);
      this.save();
      void this.payload(); // upload new crops in the background
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if ((e.key === "Backspace" || e.key === "Delete") && ref.kind === "image" && selected >= 0 && !(e.composedPath()[0] instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        ref.regions.splice(selected, 1);
        selected = Math.min(selected, ref.regions.length - 1);
        draw();
      }
    };
    document.addEventListener("keydown", onKey, true);

    const letter = (i: number) => String.fromCharCode(65 + i);
    const draw = () => {
      const isImage = ref.kind === "image";
      layer.innerHTML = `<div class="shade" data-close></div><div class="editor">
        <div class="top"><b>Reference ${index + 1}</b><span>${isImage ? "Click and drag over the parts you like. Tick what Claude should learn from each." : esc((ref as AppRef).label)}</span><button class="primary" data-close>Done</button></div>
        ${isImage ? `<div class="stage"><div class="frame"><img src="${this.imageUrl((ref as ImageRef).id)}" alt="Reference" crossorigin="anonymous">${(ref as ImageRef).regions
          .map((r, i) => `<div class="box${i === selected ? " on" : ""}" data-box="${i}" style="left:${r.box.x * 100}%;top:${r.box.y * 100}%;width:${r.box.w * 100}%;height:${r.box.h * 100}%"><i>${letter(i)}</i></div>`)
          .join("")}</div></div>` : `<div class="parts"><div class="what">▦ ${esc((ref as AppRef).label)}</div><p>Parts of the app you marked. Claude gets their sizes, colours, type and the CSS that styles them, and learns what you tick on the right.</p><details><summary>What Claude sees</summary><pre>${esc((ref as AppRef).styles.slice(0, 6000))}</pre></details></div>`}
        <div class="side">
          <section><h4>${isImage ? "The whole image" : "These parts"} <em>${ref.aspects.length ? "" : "nothing ticked = everything"}</em></h4>${this.checks("ref", ref.aspects)}<textarea data-note="ref" placeholder="What you like about it (optional)">${esc(ref.note)}</textarea></section>
          ${isImage
            ? (ref as ImageRef).regions
                .map(
                  (r, i) => `<section class="region${i === selected ? " on" : ""}" data-pick="${i}"><h4>Box ${letter(i)} <em>${r.aspects.length ? "" : "nothing ticked = everything"}</em><button data-unbox="${i}" title="Remove this box">✕</button></h4>${this.checks(`box-${i}`, r.aspects)}<textarea data-note="box-${i}" placeholder="What you like here (optional)">${esc(r.note)}</textarea></section>`,
                )
                .join("") || `<p class="hint">No boxes yet: drag over the image to mark a part. Each box gets its own checkboxes, and Claude sees it zoomed in.</p>`
            : ""}
        </div>
      </div>`;
      wire();
    };

    const wire = () => {
      layer.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));
      layer.querySelectorAll<HTMLInputElement>("[data-aspect]").forEach((box) =>
        box.addEventListener("change", () => {
          const name = box.dataset.aspect!;
          const list = name === "ref" ? ref.aspects : (ref as ImageRef).regions[Number(name.slice(4))].aspects;
          const i = list.indexOf(box.value);
          if (box.checked && i < 0) list.push(box.value);
          if (!box.checked && i >= 0) list.splice(i, 1);
          const em = box.closest("section")?.querySelector("h4 em");
          if (em) em.textContent = list.length ? "" : "nothing ticked = everything";
        }),
      );
      layer.querySelectorAll<HTMLTextAreaElement>("[data-note]").forEach((t) =>
        t.addEventListener("input", () => {
          const name = t.dataset.note!;
          if (name === "ref") ref.note = t.value;
          else (ref as ImageRef).regions[Number(name.slice(4))].note = t.value;
        }),
      );
      layer.querySelectorAll<HTMLElement>("[data-unbox]").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          (ref as ImageRef).regions.splice(Number(b.dataset.unbox), 1);
          selected = -1;
          draw();
        }),
      );
      layer.querySelectorAll<HTMLElement>("[data-pick]").forEach((s) =>
        s.addEventListener("pointerdown", () => {
          const i = Number(s.dataset.pick);
          if (i === selected) return;
          selected = i;
          layer.querySelectorAll(".box").forEach((b, j) => b.classList.toggle("on", j === i));
          layer.querySelectorAll(".region").forEach((b, j) => b.classList.toggle("on", j === i));
        }),
      );
      const frame = layer.querySelector<HTMLElement>(".frame");
      if (!frame || ref.kind !== "image") return;
      frame.addEventListener("pointerdown", (e) => {
        const hitBox = (e.target as HTMLElement).closest<HTMLElement>("[data-box]");
        if (hitBox) {
          selected = Number(hitBox.dataset.box);
          draw();
          return;
        }
        const r = frame.getBoundingClientRect();
        const fx = (v: number) => Math.min(1, Math.max(0, (v - r.left) / r.width));
        const fy = (v: number) => Math.min(1, Math.max(0, (v - r.top) / r.height));
        const x0 = fx(e.clientX);
        const y0 = fy(e.clientY);
        const ghost = document.createElement("div");
        ghost.className = "box on";
        frame.appendChild(ghost);
        frame.setPointerCapture(e.pointerId);
        let box = { x: x0, y: y0, w: 0, h: 0 };
        const move = (m: PointerEvent) => {
          const x1 = fx(m.clientX);
          const y1 = fy(m.clientY);
          box = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
          Object.assign(ghost.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
        };
        const up = () => {
          frame.removeEventListener("pointermove", move);
          frame.removeEventListener("pointerup", up);
          if (box.w > 0.02 && box.h > 0.02) {
            ref.regions.push({ box, aspects: [], note: "" });
            selected = ref.regions.length - 1;
          }
          draw();
        };
        frame.addEventListener("pointermove", move);
        frame.addEventListener("pointerup", up);
      });
    };
    draw();
  }

  // ---- marking parts of the app

  /** Click-drag over the running app; the parts inside become a reference. */
  markApp() {
    if (this.refs.length + this.uploading >= MAX) return this.opts.say(`${MAX} references at most: remove one first.`, true);
    const root = this.ensureOverlay();
    const layer = root.querySelector<HTMLElement>(".layer")!;
    layer.innerHTML = `<div class="marquee-shade"></div><div class="marquee-tip">Drag over the parts of the app you like · Esc cancels</div>`;
    const shade = layer.querySelector<HTMLElement>(".marquee-shade")!;
    const done = () => {
      layer.innerHTML = "";
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      done();
    };
    document.addEventListener("keydown", onKey, true);
    shade.addEventListener("pointerdown", (e) => {
      const x0 = e.clientX;
      const y0 = e.clientY;
      const rect = document.createElement("div");
      rect.className = "marquee";
      layer.appendChild(rect);
      shade.setPointerCapture(e.pointerId);
      let box = { left: x0, top: y0, right: x0, bottom: y0 };
      const move = (m: PointerEvent) => {
        box = { left: Math.min(x0, m.clientX), top: Math.min(y0, m.clientY), right: Math.max(x0, m.clientX), bottom: Math.max(y0, m.clientY) };
        Object.assign(rect.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
      };
      const up = () => {
        shade.removeEventListener("pointermove", move);
        shade.removeEventListener("pointerup", up);
        done();
        if (box.right - box.left < 8 || box.bottom - box.top < 8) return;
        const parts = this.partsIn(box);
        if (!parts.length) return this.opts.say("Nothing in that box: drag over the parts themselves.", true);
        const { label, styles } = this.opts.describeParts(parts);
        this.refs.push({ kind: "app", label, styles, aspects: [], note: "" });
        this.save();
        this.edit(this.refs.length - 1);
      };
      shade.addEventListener("pointermove", move);
      shade.addEventListener("pointerup", up);
    });
  }

  /** The outermost visible elements mostly inside a screen box (at most 12). */
  private partsIn(box: { left: number; top: number; right: number; bottom: number }): Element[] {
    const inside = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const w = Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left));
      const h = Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top));
      return (w * h) / (r.width * r.height) > 0.7;
    };
    const found: Element[] = [];
    const walk = (el: Element) => {
      for (const child of el.children) {
        if (child.hasAttribute("data-review-tool") || child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
        if (inside(child)) found.push(child);
        else walk(child);
        if (found.length >= 12) return;
      }
    };
    walk(document.body);
    return found;
  }
}

/** A short line per reference for a status message, e.g. "2 references (colour, cards)". */
export const describeBoard = (refs: ReferencePayload[]) =>
  refs.length ? `${refs.length} reference${refs.length === 1 ? "" : "s"}` : "no references";
