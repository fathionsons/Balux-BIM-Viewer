import type { ViewerToolId } from "../viewerStore";
import type { ViewerApp } from "../ViewerApp";
import type { ViewerTool } from "./Tool";

export class ToolManager {
  private app: ViewerApp;
  private tools = new Map<ViewerToolId, ViewerTool>();
  private _active: ViewerTool | null = null;

  constructor(app: ViewerApp) {
    this.app = app;
  }

  register(tool: ViewerTool) {
    this.tools.set(tool.id, tool);
  }

  get active() {
    return this._active;
  }

  async setActive(id: ViewerToolId) {
    const next = this.tools.get(id);
    if (!next) {
      throw new Error(`Tool ${id} not registered.`);
    }
    if (this._active?.id === id) return;

    if (this._active) {
      await this._active.onDisable(this.app);
    }

    this._active = next;
    await next.onEnable(this.app);
    this.app.setCursor(next.cursor);
  }

  async onPointerDown(ev: PointerEvent) {
    await this._active?.onPointerDown?.(this.app, ev);
  }

  async onPointerMove(ev: PointerEvent) {
    await this._active?.onPointerMove?.(this.app, ev);
  }

  async onPointerUp(ev: PointerEvent) {
    await this._active?.onPointerUp?.(this.app, ev);
  }

  async onKeyDown(ev: KeyboardEvent) {
    await this._active?.onKeyDown?.(this.app, ev);
  }
}

