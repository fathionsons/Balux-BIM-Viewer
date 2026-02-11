import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";

export class ModelTransformTool implements ViewerTool {
  id = "transform" as const;
  cursor = "grab";

  onEnable(app: ViewerApp) {
    app.enableModelTransformEditing(true);
  }

  onDisable(app: ViewerApp) {
    app.enableModelTransformEditing(false);
  }

  onPointerDown(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;
    app.setCursor("grabbing");
  }

  onPointerUp(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;
    app.setCursor("grab");
  }

  onKeyDown(app: ViewerApp, ev: KeyboardEvent) {
    const key = ev.key.toLowerCase();
    if (key === "r") {
      app.setModelTransformMode("rotate");
      ev.preventDefault();
      return;
    }
    if (key === "t") {
      app.setModelTransformMode("translate");
      ev.preventDefault();
      return;
    }
    if (key === "0") {
      app.resetModelTransform();
      ev.preventDefault();
    }
  }
}
