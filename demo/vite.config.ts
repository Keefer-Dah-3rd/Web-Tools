import { defineConfig } from "vite";
import { pageEditor } from "../page-editor/vite-plugin.mjs";

// The demo page with the editor's dev-server half. Saves land in demo/page-edits/ (ignored by git).
export default defineConfig({
  plugins: [pageEditor({ facts: ["facts.md"] })],
});
