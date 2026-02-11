import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

type TransformMode = "translate" | "rotate";

export class ModelTransformManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private dom: HTMLElement;
  private controls: TransformControls;
  private controlsHelper!: THREE.Object3D;
  private enabled = false;
  private mode: TransformMode = "rotate";
  private gizmoVisible = true;
  private target: THREE.Object3D | null = null;
  private dragging = false;
  private baseline = new Map<
    THREE.Object3D,
    { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }
  >();
  private onDraggingChanged?: (dragging: boolean) => void;
  private onTransformChanged?: () => void;

  constructor(opts: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    dom: HTMLElement;
    onDraggingChanged?: (dragging: boolean) => void;
    onTransformChanged?: () => void;
  }) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.dom = opts.dom;
    this.onDraggingChanged = opts.onDraggingChanged;
    this.onTransformChanged = opts.onTransformChanged;

    this.controls = new TransformControls(this.camera, this.dom);
    this.controls.setSpace("local");
    this.controls.setMode(this.mode);
    this.controls.size = 0.9;
    this.controlsHelper = this.controls.getHelper();
    this.controlsHelper.name = "ModelTransformControls";
    this.controlsHelper.visible = false;
    this.scene.add(this.controlsHelper);

    this.controls.addEventListener("dragging-changed", (e) => {
      const dragging = Boolean((e as { value?: unknown }).value);
      this.dragging = dragging;
      this.onDraggingChanged?.(dragging);
      if (!dragging) this.onTransformChanged?.();
    });

    this.controls.addEventListener("change", () => {
      if (this.dragging) return;
      this.onTransformChanged?.();
    });
  }

  dispose() {
    this.controls.dispose();
    this.controlsHelper.removeFromParent();
    this.baseline.clear();
    this.target = null;
  }

  setTarget(target: THREE.Object3D | null) {
    if (this.target === target) return;
    this.target = target;
    if (target && !this.baseline.has(target)) {
      this.baseline.set(target, {
        position: target.position.clone(),
        quaternion: target.quaternion.clone(),
        scale: target.scale.clone(),
      });
    }
    this.updateAttach();
    this.updateVisibility();
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.updateAttach();
    this.updateVisibility();
  }

  getEnabled() {
    return this.enabled;
  }

  setMode(mode: TransformMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.controls.setMode(mode);
  }

  getMode() {
    return this.mode;
  }

  setGizmoVisible(visible: boolean) {
    if (this.gizmoVisible === visible) return;
    this.gizmoVisible = visible;
    this.updateVisibility();
  }

  getGizmoVisible() {
    return this.gizmoVisible;
  }

  resetTargetTransform() {
    if (!this.target) return;
    const baseline = this.baseline.get(this.target);
    if (!baseline) return;
    this.target.position.copy(baseline.position);
    this.target.quaternion.copy(baseline.quaternion);
    this.target.scale.copy(baseline.scale);
    this.target.updateMatrixWorld(true);
    this.onTransformChanged?.();
  }

  private updateAttach() {
    if (!this.enabled || !this.target) {
      this.controls.detach();
      return;
    }
    this.controls.attach(this.target);
  }

  private updateVisibility() {
    this.controlsHelper.visible = this.enabled && this.gizmoVisible && Boolean(this.target);
  }
}
