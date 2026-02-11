import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";

export class CutTool implements ViewerTool {
  id = "cut" as const;
  cursor = "crosshair";
  private dragging = false;
  private dragStartPx = 0;
  private dragStartOffset = 0;

  private axisScreenDirection(axis: "x" | "y" | "z") {
    return axis === "x" ? "horizontal" : "vertical";
  }

  onEnable(app: ViewerApp) {
    this.dragging = false;
    app.setCursor(app.getCutCursor());
    app.enableCut(true);
  }

  onDisable(app: ViewerApp) {
    this.dragging = false;
    app.enableCut(false);
  }

  onPointerDown(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;
    const cut = app.getCutState();
    const dir = this.axisScreenDirection(cut.axis);
    this.dragging = true;
    this.dragStartPx = dir === "vertical" ? ev.clientY : ev.clientX;
    this.dragStartOffset = cut.offset;
    app.setCursor("grabbing");
  }

  onPointerMove(app: ViewerApp, ev: PointerEvent) {
    if (!this.dragging) return;
    if ((ev.buttons & 1) === 0) {
      this.dragging = false;
      app.setCursor(app.getCutCursor());
      return;
    }
    const cut = app.getCutState();
    const dir = this.axisScreenDirection(cut.axis);
    const range = Math.max(0.0001, cut.max - cut.min);
    const pxNow = dir === "vertical" ? ev.clientY : ev.clientX;
    const deltaPx = pxNow - this.dragStartPx;
    const viewportSpan = dir === "vertical" ? app.container.clientHeight : app.container.clientWidth;
    const safeViewport = Math.max(1, viewportSpan);
    const normalized = dir === "vertical" ? -deltaPx / safeViewport : deltaPx / safeViewport;
    const baseSensitivity = 0.78;
    const precision = ev.shiftKey ? 0.28 : ev.altKey ? 1.75 : 1;
    app.setCutOffset(this.dragStartOffset + normalized * range * baseSensitivity * precision);
  }

  onPointerUp(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;
    this.dragging = false;
    app.setCursor(app.getCutCursor());
  }

  onKeyDown(app: ViewerApp, ev: KeyboardEvent) {
    const key = ev.key.toLowerCase();
    if (key === "x" || key === "y" || key === "z") {
      app.setCutAxis(key);
      ev.preventDefault();
      return;
    }

    if (key === "v") {
      const cut = app.getCutState();
      const next = cut.axis === "x" ? "y" : cut.axis === "y" ? "z" : "x";
      app.setCutAxis(next);
      ev.preventDefault();
      return;
    }

    if (key === "[" || key === "]") {
      const cut = app.getCutState();
      const step = Math.max((cut.max - cut.min) / 200, 0.005);
      const dir = key === "[" ? -1 : 1;
      app.setCutOffset(cut.offset + dir * step);
      ev.preventDefault();
    }
  }
}
