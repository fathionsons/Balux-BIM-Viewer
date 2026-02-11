import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";

export class SelectTool implements ViewerTool {
  id = "select" as const;
  cursor = "default";

  private clickThresholdPx = 5;
  private raf = 0;
  private lastMoveEv: PointerEvent | null = null;
  private hoverSuspended = false;
  private pointerDown:
    | {
        x: number;
        y: number;
        multi: boolean;
      }
    | null = null;

  onEnable(app: ViewerApp) {
    void app;
  }

  async onDisable(app: ViewerApp) {
    this.lastMoveEv = null;
    this.pointerDown = null;
    this.hoverSuspended = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    await app.clearHover();
  }

  onPointerMove(app: ViewerApp, ev: PointerEvent) {
    if (ev.pointerType === "touch") return;
    if (ev.buttons !== 0) {
      if (!this.hoverSuspended) {
        this.hoverSuspended = true;
        void app.clearHover();
      }
      return;
    }
    this.hoverSuspended = false;

    this.lastMoveEv = ev;
    if (this.raf) return;
    this.raf = requestAnimationFrame(async () => {
      this.raf = 0;
      const e = this.lastMoveEv;
      this.lastMoveEv = null;
      if (!e) return;
      await app.hoverFromPointerEvent(e);
    });
  }

  onPointerDown(app: ViewerApp, ev: PointerEvent) {
    void app;
    if (ev.button !== 0) return;
    this.pointerDown = { x: ev.clientX, y: ev.clientY, multi: ev.shiftKey };
  }

  async onPointerUp(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;
    const down = this.pointerDown;
    this.pointerDown = null;
    this.hoverSuspended = false;
    if (!down) return;

    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    if (moved > this.clickThresholdPx) return;

    await app.selectFromPointerEvent(ev, { multi: down.multi });
  }
}

