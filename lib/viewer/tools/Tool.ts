import type { ViewerToolId } from "../viewerStore";
import type { ViewerApp } from "../ViewerApp";

export interface ViewerTool {
  id: ViewerToolId;
  cursor: string;

  onEnable(app: ViewerApp): void | Promise<void>;
  onDisable(app: ViewerApp): void | Promise<void>;

  onPointerDown?(app: ViewerApp, ev: PointerEvent): void | Promise<void>;
  onPointerMove?(app: ViewerApp, ev: PointerEvent): void | Promise<void>;
  onPointerUp?(app: ViewerApp, ev: PointerEvent): void | Promise<void>;
  onKeyDown?(app: ViewerApp, ev: KeyboardEvent): void | Promise<void>;
}

