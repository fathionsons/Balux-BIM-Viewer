import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";

export class CutTool implements ViewerTool {
  id = "cut" as const;
  cursor = "crosshair";
  private dragging = false;
  private dragStartPx = 0;
  private dragStartOffset = 0;

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
    this.dragging = true;
    this.dragStartPx = cut.orientation === "horizontal" ? ev.clientY : ev.clientX;
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
    const range = Math.max(0.0001, cut.max - cut.min);
    const pxNow = cut.orientation === "horizontal" ? ev.clientY : ev.clientX;
    const deltaPx = pxNow - this.dragStartPx;
    const viewportSpan =
      cut.orientation === "horizontal" ? app.container.clientHeight : app.container.clientWidth;
    const safeViewport = Math.max(1, viewportSpan);
    const normalized = cut.orientation === "horizontal" ? -deltaPx / safeViewport : deltaPx / safeViewport;
    app.setCutOffset(this.dragStartOffset + normalized * range);
  }

  onPointerUp(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;
    this.dragging = false;
    app.setCursor(app.getCutCursor());
  }

  onKeyDown(app: ViewerApp, ev: KeyboardEvent) {
    const key = ev.key.toLowerCase();
    if (key === "v") {
      const cut = app.getCutState();
      app.setCutOrientation(cut.orientation === "horizontal" ? "vertical" : "horizontal");
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
