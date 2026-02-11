import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";

export class SectionBoxTool implements ViewerTool {
  id = "section" as const;
  cursor = "default";

  onEnable(app: ViewerApp) {
    app.enableSectionEditing(true);
  }

  onDisable(app: ViewerApp) {
    app.enableSectionEditing(false);
  }

  onKeyDown(app: ViewerApp, ev: KeyboardEvent) {
    const k = ev.key.toLowerCase();
    if (k === "w") app.setSectionTransformMode("translate");
    if (k === "e") app.setSectionTransformMode("rotate");
    if (k === "r") app.setSectionTransformMode("scale");
  }
}

