/**
 * Apply and Undo for the panels (Colour Lab, Design Generator): ask the helper to write a save
 * into the project's code (apply.mjs), and remember the last one so it can be undone after the
 * page reloads. The helper commits each apply on the project's branch; Undo reverts that commit.
 */

export interface Applied {
  commit: string;
  name: string;
  summary: string;
  files?: string[];
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `The helper answered ${res.status}.`);
  return data;
}

export class CodeWriter {
  private readonly key: string;

  constructor(
    private readonly endpoint: string,
    storagePrefix: string,
    tool: string,
  ) {
    this.key = `${storagePrefix}:${tool}:applied`;
  }

  /** The last apply from this tool, if it hasn't been undone. */
  get last(): Applied | null {
    try {
      return JSON.parse(localStorage.getItem(this.key) ?? "null");
    } catch {
      return null;
    }
  }

  private set last(value: Applied | null) {
    try {
      if (value) localStorage.setItem(this.key, JSON.stringify(value));
      else localStorage.removeItem(this.key);
    } catch {
      /* the apply still happened; Undo just won't survive a reload */
    }
  }

  private get pendingKey() {
    return `${this.key}:pending`;
  }

  /** Write a saved palette or design (by its file name from the save) into the code. */
  async apply(kind: "palette" | "design", file: string, name: string): Promise<Applied> {
    // The app's dev server may reload the page as soon as the code changes, before the answer
    // arrives; note the apply first so the reloaded page can pick up its result (recover()).
    try {
      localStorage.setItem(this.pendingKey, JSON.stringify({ file, name, at: new Date().toISOString() }));
    } catch {
      /* no storage: the answer still arrives if the page stays */
    }
    const done = await post<{ commit: string; summary: string; files: string[] }>(`${this.endpoint}/apply`, { kind, name: file });
    const applied = { commit: done.commit, name, summary: done.summary, files: done.files };
    this.last = applied;
    localStorage.removeItem(this.pendingKey);
    return applied;
  }

  /**
   * After a reload: if an apply was in flight, ask the helper how it went. Returns the apply when it
   * finished (and remembers it for Undo), "waiting" while it's still running, or null.
   */
  async recover(): Promise<Applied | { failed: string } | "waiting" | null> {
    let pending: { file: string; name: string; at: string } | null = null;
    try {
      pending = JSON.parse(localStorage.getItem(this.pendingKey) ?? "null");
    } catch {
      pending = null;
    }
    if (!pending) return null;
    try {
      const res = await fetch(`${this.endpoint}/applied`);
      const { log, busy } = (await res.json()) as { log: { save: string; commit?: string; summary?: string; files?: string[]; at: string; undone?: string; failed?: string }[]; busy: string | null };
      const entry = log.find((e) => e.save === pending!.file && e.at >= pending!.at && !e.undone);
      if (entry?.failed) {
        localStorage.removeItem(this.pendingKey);
        return { failed: entry.failed };
      }
      if (entry?.commit) {
        localStorage.removeItem(this.pendingKey);
        const applied = { commit: entry.commit, name: pending.name, summary: entry.summary ?? "", files: entry.files };
        this.last = applied;
        return applied;
      }
      if (busy === pending.file) return "waiting";
      localStorage.removeItem(this.pendingKey);
      return null;
    } catch {
      return null;
    }
  }

  async undo(): Promise<string> {
    const last = this.last;
    if (!last) throw new Error("Nothing to undo.");
    const done = await post<{ summary: string }>(`${this.endpoint}/undo`, { commit: last.commit });
    this.last = null;
    return done.summary;
  }
}

/** The row a panel shows under its status: what went into the code last, with Undo. */
export const appliedRow = (last: Applied | null, esc: (s: string) => string) =>
  last
    ? `<div class="applied"><span>In the code: <b>${esc(last.name)}</b> <code>${esc(last.commit)}</code></span><button data-act="undo-apply" title="Take it back out of the code">Undo</button></div>`
    : "";

export const APPLIED_STYLE = `
.applied { display: flex; align-items: center; gap: 8px; margin: 0 12px 8px; padding: 6px 8px 6px 10px; border-radius: 8px; background: rgba(126, 224, 138, .08); border: 1px solid rgba(126, 224, 138, .3); font-size: 11px; color: #c9f0cf; }
.applied span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.applied code { font: 600 10.5px ui-monospace, Menlo, monospace; color: #9fe3aa; }
.applied button { padding: 3px 8px; font-size: 11px; }
`;
