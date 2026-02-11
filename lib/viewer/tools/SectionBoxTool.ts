import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";

export class SectionBoxTool implements ViewerTool {
  id = "section" as const;
  cursor = "grab";

  onEnable(app: ViewerApp) {
    app.enableSectionEditing(true);
  }

  onDisable(app: ViewerApp) {
    app.enableSectionEditing(false);
  }
}

