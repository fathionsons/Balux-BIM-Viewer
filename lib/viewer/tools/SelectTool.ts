import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";

export class SelectTool implements ViewerTool {
  id = "select" as const;
  cursor = "default";

  private raf = 0;
  private lastMoveEv: PointerEvent | null = null;

  onEnable(app: ViewerApp) {
    void app;
    // No-op.
  }

  async onDisable(app: ViewerApp) {
    this.lastMoveEv = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    await app.clearHover();
  }

  onPointerMove(app: ViewerApp, ev: PointerEvent) {
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

  async onPointerDown(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;
    await app.selectFromPointerEvent(ev, { multi: ev.shiftKey });
  }
}
