import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

import type { ViewerTool } from "./Tool";
import type { ViewerApp } from "../ViewerApp";
import type { ViewerSelectionKey } from "../viewerStore";

function formatMeters(meters: number) {
  if (!Number.isFinite(meters)) return "-";
  return `${meters.toFixed(3)} m`;
}

export class MeasureTool implements ViewerTool {
  id = "measure" as const;
  cursor = "crosshair";

  private start: THREE.Vector3 | null = null;
  private shortestFrom: ViewerSelectionKey | null = null;
  private previewLine: THREE.Line | null = null;
  private previewLabel: CSS2DObject | null = null;
  private moveRaf = 0;
  private lastMoveEv: PointerEvent | null = null;
  private moveRequestSerial = 0;

  onEnable(app: ViewerApp) {
    void app.clearHover();
    this.start = null;
    this.shortestFrom = null;
    this.lastMoveEv = null;
    this.moveRequestSerial += 1;
    if (this.moveRaf) cancelAnimationFrame(this.moveRaf);
    this.moveRaf = 0;
    this.ensurePreviewObjects(app);
    this.setPreviewVisible(false);
  }

  onDisable(app: ViewerApp) {
    this.start = null;
    this.shortestFrom = null;
    this.lastMoveEv = null;
    this.moveRequestSerial += 1;
    if (this.moveRaf) cancelAnimationFrame(this.moveRaf);
    this.moveRaf = 0;
    this.disposePreviewObjects(app);
  }

  onPointerMove(app: ViewerApp, ev: PointerEvent) {
    if (ev.pointerType === "touch" && ev.buttons !== 0) return;
    this.lastMoveEv = ev;
    if (this.moveRaf) return;

    this.moveRaf = requestAnimationFrame(() => {
      this.moveRaf = 0;
      const e = this.lastMoveEv;
      this.lastMoveEv = null;
      if (!e) return;
      void this.updatePreview(app, e);
    });
  }

  async onPointerDown(app: ViewerApp, ev: PointerEvent) {
    if (ev.button !== 0) return;

    const mode = app.getMeasurementMode();

    if (mode === "coords") {
      const hit = await app.raycastFromPointerEvent(ev, { snapping: true });
      if (!hit) return;
      app.setCoordinateReadout(hit.point);
      return;
    }

    if (mode === "shortest") {
      const hit = await app.raycastFromPointerEvent(ev, { snapping: true });
      if (!hit || hit.kind !== "ifc" || hit.modelId == null || hit.localId == null) return;
      const key: ViewerSelectionKey = { modelId: hit.modelId, localId: hit.localId };
      if (!this.shortestFrom) {
        this.shortestFrom = key;
        app.noteShortestFrom(key);
        return;
      }
      await app.measureShortestDistanceBetween(this.shortestFrom, key);
      this.shortestFrom = null;
      return;
    }

    const hit = await app.raycastFromPointerEvent(ev, { snapping: mode === "point" });
    if (!hit) return;

    if (!this.start) {
      this.start = hit.point.clone();
      this.moveRequestSerial += 1;
      this.ensurePreviewObjects(app);
      this.setPreviewVisible(true);
      (this.previewLine!.geometry as THREE.BufferGeometry).setFromPoints([this.start, this.start]);
      this.previewLine!.computeLineDistances();
      this.previewLabel!.position.copy(this.start);
      (this.previewLabel!.element as HTMLDivElement).textContent = "0.000 m";
      return;
    }

    const end = hit.point.clone();
    app.addDistanceMeasurement(this.start, end, mode);
    this.start = null;
    this.moveRequestSerial += 1;
    this.setPreviewVisible(false);
  }

  private async updatePreview(app: ViewerApp, ev: PointerEvent) {
    const mode = app.getMeasurementMode();
    const start = this.start?.clone() ?? null;
    if (!start || (mode !== "point" && mode !== "laser")) return;

    const requestId = ++this.moveRequestSerial;
    const hit = await app.raycastFromPointerEvent(ev, { snapping: mode === "point" });
    if (requestId !== this.moveRequestSerial) return;
    if (!this.start) return;
    if (!hit) {
      this.setPreviewVisible(false);
      return;
    }

    this.ensurePreviewObjects(app);
    this.setPreviewVisible(true);

    const end = hit.point;
    (this.previewLine!.geometry as THREE.BufferGeometry).setFromPoints([start, end]);
    this.previewLine!.computeLineDistances();

    const meters = start.distanceTo(end);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    this.previewLabel!.position.copy(mid);
    (this.previewLabel!.element as HTMLDivElement).textContent = formatMeters(meters);
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
    const stale = app.scene.getObjectByName("MeasurePreviewLine");
    stale?.removeFromParent();
  }
}

