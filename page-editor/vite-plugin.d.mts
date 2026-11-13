import type { Plugin } from "vite";

export interface PageEditorPluginOptions {
  /** Must match mountEditor's `endpoint`. Default "/__page-editor". */
  endpoint?: string;
  /** Where saves and session requests go, relative to the Vite root. Default "page-edits". Keep it out of git. */
  editsDir?: string;
  /** The rewrite instructions (Markdown). Default: briefs/default.md. */
  brief?: string;
  /** Files with the page's facts and numbers, sent with every rewrite. */
  facts?: string[];
  /** Claude model. Default "claude-opus-5-5" (or the PAGE_EDITOR_MODEL environment variable). */
  model?: string;
  /** "low" | "medium" | "high". Default "medium". */
  effort?: string;
  /** If the Claude Code CLI fails, wait for an open Claude Code session to answer. Default true. */
  sessionFallback?: boolean;
}

export function pageEditor(options?: PageEditorPluginOptions): Plugin;
