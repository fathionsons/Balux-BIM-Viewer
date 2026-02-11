import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";

function formatMeters(meters: number) {
  if (!Number.isFinite(meters)) return "-";
  return `${meters.toFixed(3)} m`;
}

export class MeasureTool implements ViewerTool {
  id = "measure" as const;
  cursor = "crosshair";

  private start: THREE.Vector3 | null = null;
  private previewLine: THREE.Line | null = null;
  private previewLabel: CSS2DObject | null = null;

  onEnable(app: ViewerApp) {
    void app.clearHover();
    this.start = null;
    this.ensurePreviewObjects(app);
    this.setPreviewVisible(false);
  }

  onDisable(app: ViewerApp) {
    this.start = null;
    this.disposePreviewObjects(app);
  }

  async onPointerMove(app: ViewerApp, ev: PointerEvent) {
    if (!this.start) return;
    const hit = await app.raycastFromPointerEvent(ev, { snapping: true });
    if (!hit) return;

    this.ensurePreviewObjects(app);
    this.setPreviewVisible(true);

    const end = hit.point;
    const pts = [this.start, end];
    (this.previewLine!.geometry as THREE.BufferGeometry).setFromPoints(pts);
    this.previewLine!.computeLineDistances();

    const meters = this.start.distanceTo(end);
    const mid = new THREE.Vector3().addVectors(this.start, end).multiplyScalar(0.5);
    this.previewLabel!.position.copy(mid);
    (this.previewLabel!.element as HTMLDivElement).textContent = formatMeters(meters);
  }

  async onPointerDown(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;

    const hit = await app.raycastFromPointerEvent(ev, { snapping: true });
    if (!hit) return;

    if (!this.start) {
      this.start = hit.point.clone();
      this.ensurePreviewObjects(app);
      this.setPreviewVisible(true);
      (this.previewLine!.geometry as THREE.BufferGeometry).setFromPoints([
        this.start,
        this.start,
      ]);
      this.previewLine!.computeLineDistances();
      this.previewLabel!.position.copy(this.start);
      (this.previewLabel!.element as HTMLDivElement).textContent = "0.000 m";
      return;
    }

    const end = hit.point.clone();
    app.addMeasurement(this.start, end);
    this.start = null;
    this.setPreviewVisible(false);
  }

  private ensurePreviewObjects(app: ViewerApp) {
    if (this.previewLine && this.previewLabel) return;

    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const mat = new THREE.LineDashedMaterial({
      color: new THREE.Color("#0ea5e9"),
      transparent: true,
      opacity: 0.9,
      dashSize: 0.1,
      gapSize: 0.06,
    });
    const line = new THREE.Line(geom, mat);
    line.computeLineDistances();
    line.frustumCulled = false;
    line.name = "MeasurePreviewLine";

    const el = document.createElement("div");
    el.className =
      "pointer-events-none select-none rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-900 shadow-panel backdrop-blur";
    const label = new CSS2DObject(el);
    label.name = "MeasurePreviewLabel";

    app.scene.add(line);
    app.scene.add(label);
    this.previewLine = line;
    this.previewLabel = label;
  }

  private setPreviewVisible(visible: boolean) {
    if (this.previewLine) this.previewLine.visible = visible;
    if (this.previewLabel) this.previewLabel.visible = visible;
  }

  private disposePreviewObjects(app: ViewerApp) {
    if (this.previewLine) {
      this.previewLine.removeFromParent();
      (this.previewLine.geometry as THREE.BufferGeometry).dispose();
      (this.previewLine.material as THREE.Material).dispose();
      this.previewLine = null;
    }
    if (this.previewLabel) {
      this.previewLabel.removeFromParent();
      this.previewLabel.element.remove();
      this.previewLabel = null;
    }
    // Ensure we remove any stale nodes if something went wrong.
    const stale = app.scene.getObjectByName("MeasurePreviewLine");
    stale?.removeFromParent();
  }
}
