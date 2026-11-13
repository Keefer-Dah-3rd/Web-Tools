/**
 * keefedesign.com in the live editor. Loaded by the ✎ Edit page bookmark (npm run live).
 *
 * - Opens only when you're signed in to the site's WordPress admin in this browser, on top of
 *   being bookmark-only, so the toolbar can never appear for a visitor.
 * - Works on any page. On the Coco case study it edits inside the Coco embed (its own code);
 *   elsewhere it edits the whole page (Semplice content).
 * - Each page saves under its own id, from its address: /project/coco → project-coco, / → home.
 */
import { mountEditor } from "../editor";
import { COCO_NAMES, COCO_SWATCHES, KEEFEDESIGN_TYPES } from "../../page-editor/presets/keefedesign";

const signedIn = document.body.classList.contains("logged-in") || !!document.getElementById("wpadminbar");
if (!signedIn) {
  window.alert("Sign in to keefedesign.com (WordPress) in this browser first. The live editor only opens for you.");
} else {
  const slug = location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/-+$/, "");
  const coco = document.querySelector("[data-coco-case]");
  mountEditor({
    page: slug || "home",
    scope: coco ? "[data-coco-case]" : undefined,
    types: KEEFEDESIGN_TYPES,
    swatches: COCO_SWATCHES,
    names: [...COCO_NAMES, "John", "Keefe", "Semplice"],
    storagePrefix: "keefedesign-live",
  });
}
