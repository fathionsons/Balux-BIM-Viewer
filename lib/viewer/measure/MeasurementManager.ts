import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

import { createId } from "../id";

export type MeasurementItem = {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  meters: number;
};

function formatMeters(meters: number) {
  if (!Number.isFinite(meters)) return "-";
  return `${meters.toFixed(3)} m`;
}

export class MeasurementManager {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private items = new Map<
    string,
    {
      line: THREE.Line;
      arrowStart: THREE.ArrowHelper;
      arrowEnd: THREE.ArrowHelper;
      label: CSS2DObject;
      start: THREE.Vector3;
      end: THREE.Vector3;
    }
  >();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = "Measurements";
    this.scene.add(this.group);
  }

  dispose() {
    for (const id of [...this.items.keys()]) this.remove(id);
    this.group.removeFromParent();
  }

  list(): MeasurementItem[] {
    const out: MeasurementItem[] = [];
    for (const [id, it] of this.items) {
      const meters = it.start.distanceTo(it.end);
      out.push({ id, start: it.start.clone(), end: it.end.clone(), meters });
    }
    return out;
  }

  add(start: THREE.Vector3, end: THREE.Vector3) {
    const id = createId("measure");

    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color("#0ea5e9"),
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;

    const color = new THREE.Color("#0ea5e9");
    const arrowStart = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      start.clone(),
      0.08,
      color,
      0.08,
      0.04
    );
    const arrowEnd = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      end.clone(),
      0.08,
      color,
      0.08,
      0.04
    );
    arrowStart.line.frustumCulled = false;
    arrowEnd.line.frustumCulled = false;

    const labelEl = document.createElement("div");
    labelEl.className =
      "pointer-events-none select-none rounded-md border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-900 shadow-panel backdrop-blur";
    const label = new CSS2DObject(labelEl);
    label.position.copy(new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5));

    this.items.set(id, {
      line,
      arrowStart,
      arrowEnd,
      label,
      start: start.clone(),
      end: end.clone(),
    });
    this.group.add(line);
    this.group.add(arrowStart);
    this.group.add(arrowEnd);
    this.group.add(label);
    this.update(id);

    return id;
  }

  update(id: string) {
    const it = this.items.get(id);
    if (!it) return;

    const pts = [it.start, it.end];
    (it.line.geometry as THREE.BufferGeometry).setFromPoints(pts);
    it.label.position.copy(new THREE.Vector3().addVectors(it.start, it.end).multiplyScalar(0.5));

    const dir = new THREE.Vector3().subVectors(it.end, it.start);
    const len = dir.length();
    const visible = len > 1e-4;
    it.arrowStart.visible = visible;
    it.arrowEnd.visible = visible;
    if (visible) {
      dir.multiplyScalar(1 / len);
      const head = THREE.MathUtils.clamp(len * 0.12, 0.05, 0.28);
      it.arrowStart.position.copy(it.start);
      it.arrowStart.setDirection(dir);
      it.arrowStart.setLength(head, head * 0.9, head * 0.55);

      it.arrowEnd.position.copy(it.end);
      it.arrowEnd.setDirection(dir.clone().negate());
      it.arrowEnd.setLength(head, head * 0.9, head * 0.55);
    }

    const meters = it.start.distanceTo(it.end);
    const el = it.label.element as HTMLDivElement;
    el.textContent = formatMeters(meters);
  }

  remove(id: string) {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);

    it.line.removeFromParent();
    it.arrowStart.removeFromParent();
    it.arrowEnd.removeFromParent();
    it.label.removeFromParent();

    (it.line.geometry as THREE.BufferGeometry).dispose();
    (it.line.material as THREE.Material).dispose();
    it.arrowStart.line.geometry.dispose();
    (it.arrowStart.line.material as THREE.Material).dispose();
    it.arrowStart.cone.geometry.dispose();
    (it.arrowStart.cone.material as THREE.Material).dispose();
    it.arrowEnd.line.geometry.dispose();
    (it.arrowEnd.line.material as THREE.Material).dispose();
    it.arrowEnd.cone.geometry.dispose();
    (it.arrowEnd.cone.material as THREE.Material).dispose();
    it.label.element.remove();
  }

  clear() {
    for (const id of [...this.items.keys()]) this.remove(id);
  }
}
