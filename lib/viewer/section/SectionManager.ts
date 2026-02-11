import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

export type SectionMode = "box" | "plane";

export class SectionManager {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private dom: HTMLElement;
  private onDraggingChanged?: (dragging: boolean) => void;

  private enabled = false;
  private mode: SectionMode = "box";
  private invert = false;

  // Materials we mutate to set clipping planes.
  private materials = new Set<THREE.Material>();

  // Active clipping planes reference (mutated in place).
  private readonly noPlanes: THREE.Plane[] = [];
  private readonly boxPlanes: THREE.Plane[] = Array.from({ length: 6 }, () => new THREE.Plane());
  private activePlanes: THREE.Plane[] = this.noPlanes;

  // Box gizmo
  private box = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color("#0ea5e9"),
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    })
  );
  private boxEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(this.box.geometry as THREE.BufferGeometry),
    new THREE.LineBasicMaterial({ color: new THREE.Color("#0284c7"), transparent: true, opacity: 0.9 })
  );
  private controls: TransformControls;
  private controlsHelper: THREE.Object3D;
  private editing = false;
  private lockRotation = false;
  private gizmoVisible = true;
  private boxPlaneUpdateRaf = 0;
  private readonly localPoints = [
    new THREE.Vector3(0.5, 0, 0), // +X
    new THREE.Vector3(-0.5, 0, 0), // -X
    new THREE.Vector3(0, 0.5, 0), // +Y
    new THREE.Vector3(0, -0.5, 0), // -Y
    new THREE.Vector3(0, 0, 0.5), // +Z
    new THREE.Vector3(0, 0, -0.5), // -Z
  ];
  private readonly inwardNormals = [
    new THREE.Vector3(-1, 0, 0), // +X face
    new THREE.Vector3(1, 0, 0), // -X face
    new THREE.Vector3(0, -1, 0), // +Y face
    new THREE.Vector3(0, 1, 0), // -Y face
    new THREE.Vector3(0, 0, -1), // +Z face
    new THREE.Vector3(0, 0, 1), // -Z face
  ];
  private readonly tmpNormalMatrix = new THREE.Matrix3();
  private readonly tmpPoint = new THREE.Vector3();
  private readonly tmpNormal = new THREE.Vector3();

  // Plane mode
  private planeAxis: "x" | "y" | "z" = "z";
  private planeOffset = 0;
  private planeBounds: { min: number; max: number } = { min: -1, max: 1 };
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  private readonly planePlanes: THREE.Plane[] = [this.plane];

  constructor(opts: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    dom: HTMLElement;
    onDraggingChanged?: (dragging: boolean) => void;
  }) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.dom = opts.dom;
    this.onDraggingChanged = opts.onDraggingChanged;

    this.box.name = "SectionBox";
    // Mark gizmo objects so callers can exclude them from section material registration.
    this.box.userData.__sectionGizmo = true;
    this.boxEdges.name = "SectionBoxEdges";
    this.box.add(this.boxEdges);
    this.box.visible = false;

    this.controls = new TransformControls(this.camera, this.dom);
    this.controlsHelper = this.controls.getHelper();
    this.controlsHelper.name = "SectionBoxControls";
    this.controlsHelper.userData.__sectionGizmo = true;
    this.controlsHelper.visible = false;
    this.controls.addEventListener("dragging-changed", (e) => {
      const dragging = Boolean((e as { value?: unknown }).value);
      this.onDraggingChanged?.(dragging);
    });
    this.controls.addEventListener("change", () => {
      if (!this.enabled || this.mode !== "box") return;
      if (this.lockRotation) {
        this.box.rotation.set(0, 0, 0);
        this.box.updateMatrixWorld(true);
      }
      this.queueBoxPlaneUpdate();
    });

    this.scene.add(this.box);
    this.scene.add(this.controlsHelper);

    // Initialize with a default box set (invisible until enabled).
    this.updateBoxPlanes();
  }

  dispose() {
    if (this.boxPlaneUpdateRaf) cancelAnimationFrame(this.boxPlaneUpdateRaf);
    this.boxPlaneUpdateRaf = 0;
    this.controls.dispose();
    this.box.removeFromParent();
    this.controlsHelper.removeFromParent();
    (this.box.geometry as THREE.BufferGeometry).dispose();
    (this.box.material as THREE.Material).dispose();
    (this.boxEdges.geometry as THREE.BufferGeometry).dispose();
    (this.boxEdges.material as THREE.Material).dispose();
    this.materials.clear();
    this.activePlanes = this.noPlanes;
  }

  clearMaterials() {
    this.materials.clear();
  }

  registerMaterialsFrom(
    root: THREE.Object3D,
    opts?: { exclude?: (obj: THREE.Object3D) => boolean }
  ) {
    root.traverse((obj: THREE.Object3D) => {
      if (opts?.exclude?.(obj)) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) this.materials.add(m);
      } else if (mat) {
        this.materials.add(mat);
      }
    });

    // Apply current state immediately.
    this.applyToMaterials();
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.rebuildPlanes();
    this.applyToMaterials();
    this.updateGizmoVisibility();
  }

  getEnabled() {
    return this.enabled;
  }

  setMode(mode: SectionMode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.rebuildPlanes();
    this.applyToMaterials();
    this.updateGizmoVisibility();
  }

  getMode() {
    return this.mode;
  }

  setInvert(invert: boolean) {
    if (this.invert === invert) return;
    this.invert = invert;
    this.rebuildPlanes();
    this.applyToMaterials();
  }

  getInvert() {
    return this.invert;
  }

  setPlaneAxis(axis: "x" | "y" | "z") {
    if (this.planeAxis === axis) return;
    this.planeAxis = axis;
    this.updatePlane();
    this.rebuildPlanes();
    this.applyToMaterials();
  }

  setPlaneBounds(min: number, max: number) {
    this.planeBounds = { min, max };
  }

  setPlaneOffset(offset: number) {
    this.planeOffset = offset;
    this.updatePlane();
    if (this.enabled && this.mode === "plane") {
      this.rebuildPlanes();
      this.applyToMaterials();
    }
  }

  getPlaneState() {
    return {
      axis: this.planeAxis,
      offset: this.planeOffset,
      min: this.planeBounds.min,
      max: this.planeBounds.max,
    };
  }

  /** The planes reference used by materials and by the fragments threads (raycasting). */
  getActivePlanes() {
    return this.activePlanes;
  }

  /** Make the box cover the given bounding box, with a small margin. */
  resetBoxToBounds(bounds: THREE.Box3) {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    // Add a small breathing room.
    const margin = 1.03;
    size.multiplyScalar(margin);

    this.box.position.copy(center);
    this.box.rotation.set(0, 0, 0);
    this.box.scale.set(Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01));
    this.box.updateMatrixWorld(true);
    this.controls.attach(this.box);
    this.updateBoxPlanes();
    this.applyToMaterials();
  }

  setBoxEditing(active: boolean) {
    this.editing = active;
    this.updateGizmoVisibility();
  }

  setGizmoVisible(visible: boolean) {
    this.gizmoVisible = visible;
    this.updateGizmoVisibility();
  }

  getGizmoVisible() {
    return this.gizmoVisible;
  }

  setControlSize(size: number) {
    this.controls.size = THREE.MathUtils.clamp(size, 0.75, 2.8);
  }

  setTransformMode(mode: "translate" | "rotate" | "scale") {
    if (this.lockRotation && mode === "rotate") {
      this.controls.setMode("translate");
      return;
    }
    this.controls.setMode(mode);
  }

  setLockRotation(locked: boolean) {
    this.lockRotation = locked;
    if (locked) {
      this.box.rotation.set(0, 0, 0);
      this.box.updateMatrixWorld(true);
      this.updateBoxPlanes();
      this.applyToMaterials();
      if (this.controls.mode === "rotate") this.controls.setMode("translate");
    }
  }

  getLockRotation() {
    return this.lockRotation;
  }

  private updateGizmoVisibility() {
    const boxMode = this.enabled && this.mode === "box";
    this.box.visible = boxMode && this.gizmoVisible;
    this.controlsHelper.visible = boxMode && this.editing && this.gizmoVisible;
    if (boxMode) {
      this.controls.attach(this.box);
    } else {
      this.controls.detach();
    }
  }

  private rebuildPlanes() {
    if (this.mode === "box") this.updateBoxPlanes();
    else this.updatePlane();

    if (!this.enabled) {
      this.activePlanes = this.noPlanes;
      return;
    }

    this.activePlanes = this.mode === "box" ? this.boxPlanes : this.planePlanes;
  }

  private applyToMaterials() {
    // Keep the same `clippingPlanes` reference for each material (we only swap between [] and the active array).
    const planes = this.getActivePlanes();
    const clipIntersection = this.mode === "box" && this.invert;

    for (const mat of this.materials) {
      const m = mat as THREE.Material & {
        clippingPlanes: THREE.Plane[] | null;
        clipIntersection: boolean;
      };

      const nextPlanes = planes.length > 0 ? planes : null;
      const planesChanged = m.clippingPlanes !== nextPlanes;
      const intersectionChanged = m.clipIntersection !== clipIntersection;

      m.clippingPlanes = nextPlanes;
      m.clipIntersection = clipIntersection;

      if (planesChanged || intersectionChanged) {
        m.needsUpdate = true;
      }
    }
  }

  private updatePlane() {
    // Plane normal points towards the side being clipped (discarded). Invert swaps the half-space.
    const normal = new THREE.Vector3();
    if (this.planeAxis === "x") normal.set(1, 0, 0);
    if (this.planeAxis === "y") normal.set(0, 1, 0);
    if (this.planeAxis === "z") normal.set(0, 0, 1);

    if (this.invert) normal.multiplyScalar(-1);

    // Plane equation used by three's clipping shader is dot(v, n) > w => discard.
    // For a plane at coordinate `offset` along axis, we set it from normal+point.
    const point = new THREE.Vector3(
      this.planeAxis === "x" ? this.planeOffset : 0,
      this.planeAxis === "y" ? this.planeOffset : 0,
      this.planeAxis === "z" ? this.planeOffset : 0
    );

    this.plane.setFromNormalAndCoplanarPoint(normal.normalize(), point);
  }

  private updateBoxPlanes() {
    this.box.updateMatrixWorld(true);
    const matWorld = this.box.matrixWorld;
    const invertMul = this.invert ? -1 : 1;
    this.tmpNormalMatrix.getNormalMatrix(matWorld);
    for (let i = 0; i < 6; i++) {
      this.tmpPoint.copy(this.localPoints[i]).applyMatrix4(matWorld);
      this.tmpNormal.copy(this.inwardNormals[i]).multiplyScalar(invertMul);
      this.tmpNormal.applyMatrix3(this.tmpNormalMatrix).normalize();
      this.boxPlanes[i].setFromNormalAndCoplanarPoint(this.tmpNormal, this.tmpPoint);
    }
  }

  private queueBoxPlaneUpdate() {
    if (this.boxPlaneUpdateRaf) return;
    this.boxPlaneUpdateRaf = requestAnimationFrame(() => {
      this.boxPlaneUpdateRaf = 0;
      this.updateBoxPlanes();
    });
  }
}
