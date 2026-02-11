import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import CameraControls from "camera-controls";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { toast } from "sonner";

import { BvhManager } from "./bvh/BvhManager";
import { MeasurementManager } from "./measure/MeasurementManager";
import { SectionManager } from "./section/SectionManager";
import { ToolManager } from "./tools/ToolManager";
import { SelectTool } from "./tools/SelectTool";
import { MeasureTool } from "./tools/MeasureTool";
import { SectionBoxTool } from "./tools/SectionBoxTool";
import {
  type PropertiesPayload,
  type RawModelIdMap,
  type ViewerSelectionKey,
  type ViewerToolId,
  useViewerStore,
} from "./viewerStore";

type ModelIdMap = OBC.ModelIdMap;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function emptyModelIdMap(): ModelIdMap {
  return {};
}

function rawToModelIdMap(raw: RawModelIdMap): ModelIdMap {
  const out: ModelIdMap = {};
  for (const [modelId, ids] of Object.entries(raw)) {
    out[modelId] = new Set(ids);
  }
  return out;
}

function modelIdMapToRaw(map: ModelIdMap): RawModelIdMap {
  const out: RawModelIdMap = {};
  for (const [modelId, ids] of Object.entries(map)) {
    out[modelId] = [...ids];
  }
  return out;
}

function countModelIdMap(map: ModelIdMap) {
  let n = 0;
  for (const ids of Object.values(map)) n += ids.size;
  return n;
}

function addToMap(target: ModelIdMap, source: ModelIdMap) {
  for (const [modelId, ids] of Object.entries(source)) {
    let t = target[modelId];
    if (!t) {
      t = new Set();
      target[modelId] = t;
    }
    for (const id of ids) t.add(id);
  }
}

function isEmptyMap(map: ModelIdMap) {
  return Object.values(map).every((s) => s.size === 0);
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function friendlyIfcLabel(category: string) {
  // Commonly categories come as IFCWALL / IfcWall. Normalize.
  const c = category.replace(/^IFC/i, "Ifc").replace(/_/g, "");
  // IfcWallStandardCase -> Walls, etc.
  const map: Array<[RegExp, string]> = [
    [/^IfcWall/i, "Walls"],
    [/^IfcSlab/i, "Slabs"],
    [/^IfcDoor/i, "Doors"],
    [/^IfcWindow/i, "Windows"],
    [/^IfcColumn/i, "Columns"],
    [/^IfcBeam/i, "Beams"],
    [/^IfcRoof/i, "Roofs"],
    [/^IfcStair/i, "Stairs"],
    [/^IfcRailing/i, "Railings"],
  ];
  for (const [re, label] of map) {
    if (re.test(c)) return label;
  }
  return c;
}

function unwrapValue(v: unknown, maxDepth = 5): unknown {
  let current = v;
  for (let i = 0; i < maxDepth; i++) {
    if (!isRecord(current)) return current;
    if (!("value" in current)) return current;
    current = current.value;
  }
  return current;
}

function toStringValue(v: unknown): string {
  const unwrapped = unwrapValue(v);
  if (unwrapped == null) return "";
  if (typeof unwrapped === "string") return unwrapped;
  if (typeof unwrapped === "number" || typeof unwrapped === "boolean") return String(unwrapped);
  try {
    return JSON.stringify(unwrapped);
  } catch {
    return String(unwrapped);
  }
}

function getAttr(data: unknown, key: string): string | null {
  if (!isRecord(data)) return null;
  const raw = data[key];
  const s = toStringValue(raw);
  return s ? s : null;
}

function collectPsetsDeep(
  node: unknown,
  out: Array<{ name: string; props: Array<{ name: string; value: string }> }>,
  visited: Set<object> = new Set()
) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const it of node) collectPsetsDeep(it, out, visited);
    return;
  }
  if (!isRecord(node)) return;
  if (visited.has(node)) return;
  visited.add(node);

  const name = getAttr(node, "Name");
  const hasProps = node.HasProperties ?? node.Properties ?? null;
  if (name && Array.isArray(hasProps)) {
    const props: Array<{ name: string; value: string }> = [];
    for (const p of hasProps) {
      const pn = getAttr(p, "Name") ?? getAttr(p, "BaseName") ?? "Property";
      const pv =
        getAttr(p, "NominalValue") ??
        getAttr(p, "Value") ??
        getAttr(p, "Description") ??
        toStringValue(p);
      props.push({ name: pn, value: pv });
    }
    // Heuristic: treat only things that look like Psets or have properties.
    if (name.startsWith("Pset_") || name.startsWith("Qto_") || props.length > 0) {
      out.push({ name, props });
    }
  }

  for (const v of Object.values(node)) collectPsetsDeep(v, out, visited);
}

export type ViewerRaycastHit = {
  kind: "ifc" | "glb";
  point: THREE.Vector3;
  normal?: THREE.Vector3;
  distance: number;
  object: THREE.Object3D;
  // IFC-only
  modelId?: string;
  localId?: number;
};

export class ViewerApp {
  static async create(container: HTMLElement) {
    const app = new ViewerApp(container);
    await app.init();
    return app;
  }

  readonly container: HTMLElement;
  readonly components: OBC.Components;
  readonly world: OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>;
  readonly sceneComponent: OBC.SimpleScene;
  readonly cameraComponent: OBC.OrthoPerspectiveCamera;
  readonly rendererComponent: OBCF.PostproductionRenderer;
  readonly scene: THREE.Scene;

  readonly fragments: OBC.FragmentsManager;
  readonly ifcLoader: OBC.IfcLoader;
  readonly hider: OBC.Hider;

  readonly highlighter: OBCF.Highlighter;
  readonly outliner: OBCF.Outliner;

  readonly tools: ToolManager;
  readonly bvh: BvhManager;
  readonly section: SectionManager;
  readonly measurements: MeasurementManager;

  // Optional non-BIM visual model (GLB). This is intentionally separate from fragments/IFC.
  private glbRoot: THREE.Object3D | null = null;
  private glbBounds: THREE.Box3 | null = null;
  private glbRaycaster = new THREE.Raycaster();

  // Classification groups for fast filters/tree.
  private classGroupItems = new Map<string, ModelIdMap>();
  private storeyGroupItems = new Map<string, ModelIdMap>();

  private fragmentsInitialized = false;
  private ifcInitialized = false;

  private manualHidden: ModelIdMap = emptyModelIdMap();
  private isolateActive = false;
  private hiddenBeforeIsolateRaw: Record<string, number[]> | null = null;

  private disposed = false;

  private statsFrames = 0;
  private statsT0 = performance.now();
  private statsUnsub?: () => void;

  // Keep navigation above model "ground" and scale camera limits per model size.
  private cameraGroundZ: number | null = null;
  private tmpCamPos = new THREE.Vector3();
  private tmpCamTarget = new THREE.Vector3();

  // Highlighter creates its own materials; when sectioning is enabled we need to ensure
  // those materials also receive the active clipping planes.
  private sectionMaterialsNeedRefresh = false;
  private sectionMaterialsRefreshArmed = new Set<"hover" | "select">(["hover", "select"]);

  private constructor(container: HTMLElement) {
    this.container = container;
    this.components = new OBC.Components();

    // World (scene + camera + renderer)
    const worlds = this.components.get(OBC.Worlds);
    this.world = worlds.create();

    this.sceneComponent = new OBC.SimpleScene(this.components);
    this.sceneComponent.setup({
      backgroundColor: new THREE.Color("#f8fafc"),
      ambientLight: { color: new THREE.Color("#ffffff"), intensity: 0.65 },
      directionalLight: {
        color: new THREE.Color("#ffffff"),
        intensity: 1.25,
        position: new THREE.Vector3(7, 12, 4),
      },
    });
    this.scene = this.sceneComponent.three;

    this.rendererComponent = new OBCF.PostproductionRenderer(this.components, this.container, {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.rendererComponent.three.setClearColor(new THREE.Color("#f8fafc"), 1);
    this.rendererComponent.three.localClippingEnabled = true;
    this.rendererComponent.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.cameraComponent = new OBC.OrthoPerspectiveCamera(this.components);

    // Important: the camera initializes its navigation modes and controls only after it has a world
    // (and the world has a renderer). Assign world parts first, then configure the camera.
    this.world.scene = this.sceneComponent;
    this.world.renderer = this.rendererComponent;
    this.world.camera = this.cameraComponent;

    // Ensure Orbit mode is active (this is also the default after world assignment).
    this.cameraComponent.set("Orbit");

    // camera-controls tuning for a "Blender-like" feel
    const controls = this.cameraComponent.controls;
    controls.smoothTime = 0.08;
    controls.draggingSmoothTime = 0.18;
    controls.dollySpeed = 1.3;
    controls.truckSpeed = 2.0;
    controls.azimuthRotateSpeed = 0.9;
    controls.polarRotateSpeed = 0.9;
    controls.dollyToCursor = false;
    controls.infinityDolly = false;
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 0.5;
    controls.maxDistance = 5000;
    controls.minZoom = 0.05;
    controls.maxZoom = 200;
    controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
    controls.mouseButtons.right = CameraControls.ACTION.TRUCK;
    controls.mouseButtons.middle = CameraControls.ACTION.DOLLY;
    controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
    controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = CameraControls.ACTION.TOUCH_TRUCK;
    controls.setLookAt(8, 6, 8, 0, 0, 0, false);

    // Helpers
    const grids = this.components.get(OBC.Grids);
    const grid = grids.create(this.world);
    grid.setup({
      visible: true,
      color: new THREE.Color("#cbd5e1"),
      primarySize: 2,
      secondarySize: 10,
      distance: 70,
    });
    grid.fade = true;

    // Core BIM components
    this.fragments = this.components.get(OBC.FragmentsManager);
    this.ifcLoader = this.components.get(OBC.IfcLoader);
    this.hider = this.components.get(OBC.Hider);

    // Frontend UX components
    this.highlighter = this.components.get(OBCF.Highlighter);
    this.outliner = this.components.get(OBCF.Outliner);

    // Performance helpers
    this.bvh = new BvhManager();

    // Tools & helpers built on top
    this.measurements = new MeasurementManager(this.scene);
    this.section = new SectionManager({
      scene: this.scene,
      camera: this.cameraComponent.three,
      dom: this.rendererComponent.three.domElement,
      onDraggingChanged: (dragging) => {
        // Don't orbit while dragging the section box.
        this.cameraComponent.enabled = !dragging;
      },
    });

    this.tools = new ToolManager(this);
    this.tools.register(new SelectTool());
    this.tools.register(new MeasureTool());
    this.tools.register(new SectionBoxTool());
  }

  private async init() {
    // Start the components update loop.
    this.components.init();
    await this.cameraComponent.projection.set("Perspective");

    // Postproduction pipeline must be initialized before using components like Outliner
    // (they access postproduction passes during setup).
    this.rendererComponent.postproduction.enabled = true;
    this.rendererComponent.postproduction.excludedObjectsEnabled = true;

    // IFC pipeline is initialized lazily/retriably so GLB loading remains available
    // even if the IFC worker/WASM bootstrap fails in dev.
    try {
      await this.ensureIfcPipeline();
    } catch (err) {
      console.warn("IFC pipeline bootstrap failed during viewer init.", err);
    }

    // Highlighter (we drive it from our tool system; disable click handlers).
    this.highlighter.setup({
      world: this.world,
      autoHighlightOnClick: false,
      selectEnabled: false,
      selectName: "select",
      autoUpdateFragments: true,
      selectMaterialDefinition: {
        color: new THREE.Color("#f97316"),
        renderedFaces: FRAGS.RenderedFaces.TWO,
        opacity: 0.35,
        transparent: true,
        preserveOriginalMaterial: true,
        depthTest: true,
        depthWrite: false,
      },
    });
    this.highlighter.styles.set("hover", {
      color: new THREE.Color("#0ea5e9"),
      renderedFaces: FRAGS.RenderedFaces.TWO,
      opacity: 0.18,
      transparent: true,
      preserveOriginalMaterial: true,
      depthTest: true,
      depthWrite: false,
    });

    // Outline: link to both hover+selection styles (single pass).
    this.outliner.world = this.world;
    this.outliner.styles.add("select");
    this.outliner.styles.add("hover");
    this.outliner.color = new THREE.Color("#0f172a");
    this.outliner.thickness = 2.0;
    this.outliner.fillOpacity = 0.0;
    this.outliner.enabled = true;

    // Input wiring
    const dom = this.rendererComponent.three.domElement;
    dom.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    dom.addEventListener("pointermove", this.onPointerMove, { passive: true });
    dom.addEventListener("pointerup", this.onPointerUp, { passive: true });
    dom.addEventListener("pointerleave", this.onPointerLeave, { passive: true });
    dom.addEventListener("dblclick", this.onDoubleClick, { passive: true });
    dom.addEventListener("contextmenu", (e: Event) => e.preventDefault());
    window.addEventListener("keydown", this.onKeyDown);

    // Stats sampling on world's update tick.
    const cb = () => {
      this.clampCameraAboveGround();

      this.statsFrames += 1;
      const now = performance.now();
      const dt = now - this.statsT0;
      if (dt < 500) return;

      const fps = Math.round((this.statsFrames * 1000) / dt);
      this.statsFrames = 0;
      this.statsT0 = now;

      const triangles = this.rendererComponent.three.info.render.triangles;
      useViewerStore.getState().setStats({ fps, triangles });
    };
    this.world.onAfterUpdate.add(cb);
    this.statsUnsub = () => this.world.onAfterUpdate.remove(cb);

    // Default tool.
    await this.setActiveTool("select");
  }

  private async ensureIfcPipeline() {
    if (!this.fragmentsInitialized) {
      this.fragments.init("/workers/fragments.worker.mjs");
      this.fragmentsInitialized = true;
    }
    if (this.ifcInitialized) return;

    await this.ifcLoader.setup({
      autoSetWasm: false,
      // web-ifc resolves non-absolute paths relative to the executing script (e.g. /_next/...),
      // which breaks local /public/wasm assets in Next dev/prod.
      wasm: { path: "/wasm/", absolute: true },
      webIfc: { COORDINATE_TO_ORIGIN: true },
    });
    this.ifcInitialized = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    const dom = this.rendererComponent.three.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("pointerup", this.onPointerUp);
    dom.removeEventListener("pointerleave", this.onPointerLeave);
    dom.removeEventListener("dblclick", this.onDoubleClick);
    window.removeEventListener("keydown", this.onKeyDown);

    this.statsUnsub?.();
    this.disposeGlbRoot();
    this.section.dispose();
    this.measurements.dispose();
    this.bvh.dispose();
    this.components.dispose();
  }

  setCursor(cursor: string) {
    this.rendererComponent.three.domElement.style.cursor = cursor;
  }

  async setActiveTool(tool: ViewerToolId) {
    useViewerStore.getState().setActiveTool(tool);
    await this.tools.setActive(tool);
  }

  private onPointerDown = (ev: PointerEvent) => {
    void this.tools.onPointerDown(ev);
  };

  private onPointerMove = (ev: PointerEvent) => {
    void this.tools.onPointerMove(ev);
  };

  private onPointerUp = (ev: PointerEvent) => {
    void this.tools.onPointerUp(ev);
  };

  private onPointerLeave = () => {
    void this.clearHover();
  };

  private onDoubleClick = (ev: MouseEvent) => {
    void (async () => {
      // Double click focuses the hovered element if any; otherwise frame selection/model.
      const hovered = useViewerStore.getState().hovered;
      if (hovered) {
        await this.selectFromKey(hovered, { multi: false });
        await this.frameSelection();
        return;
      }
      const sel = useViewerStore.getState().selection;
      if (Object.keys(sel).length > 0) {
        await this.frameSelection();
        return;
      }
      await this.frameModel();
    })();
    ev.preventDefault();
  };

  private onKeyDown = (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

    const key = ev.key.toLowerCase();
    if (key === "f") {
      void this.frameSelection();
      ev.preventDefault();
      return;
    }

    if (key === "h") {
      if (ev.altKey) {
        void this.unhideAll();
        ev.preventDefault();
        return;
      }
      if (ev.shiftKey) {
        void this.isolateSelected();
        ev.preventDefault();
        return;
      }
      void this.hideSelected();
      ev.preventDefault();
      return;
    }

    if (key === "escape") {
      const activeTool = useViewerStore.getState().activeTool;
      if (activeTool !== "select") {
        void this.setActiveTool("select");
      } else {
        void this.clearSelection();
      }
      ev.preventDefault();
      return;
    }

    // Forward remaining keys to the active tool (e.g. section box W/E/R mode switching).
    void this.tools.onKeyDown(ev);
  };

  async raycastFromPointerEvent(
    ev: PointerEvent,
    opts?: { snapping?: boolean }
  ): Promise<ViewerRaycastHit | null> {
    const camera = this.cameraComponent.three;
    const dom = this.rendererComponent.three.domElement;

    const isVisibleBySectioning = (point: THREE.Vector3) => {
      const planes = this.section.getActivePlanes();
      if (planes.length === 0) return true;
      const eps = 1e-6;
      const isInsideAll = planes.every((p) => p.distanceToPoint(point) > eps);
      const isInsideAny = planes.some((p) => p.distanceToPoint(point) > eps);

      // When box invert is enabled we use "intersection" clipping (clip inside the box),
      // so a hit is valid if it's outside (i.e. not inside all planes).
      if (this.section.getMode() === "box" && this.section.getInvert()) {
        return isInsideAny;
      }
      return isInsideAll;
    };

    // 1) IFC/fragments picking (BIM).
    if (this.fragments.initialized && this.fragments.list.size > 0) {
      const mouse = new THREE.Vector2(ev.clientX, ev.clientY);
      const snappingClasses = opts?.snapping ? [FRAGS.SnappingClass.FACE] : undefined;
      const res = await this.fragments.raycast({ camera, dom, mouse, snappingClasses });
      if (res && isVisibleBySectioning(res.point)) {
        return {
          kind: "ifc",
          point: res.point,
          normal: res.normal,
          distance: res.distance,
          object: res.object,
          modelId: res.fragments.modelId,
          localId: res.localId,
        };
      }
    }

    // 2) GLB/visual picking (no BIM metadata).
    if (this.glbRoot) {
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );

      this.glbRaycaster.setFromCamera(ndc, camera);
      const hits = this.glbRaycaster.intersectObject(this.glbRoot, true);
      const hit = hits.find((h) => h.point && isVisibleBySectioning(h.point));
      if (!hit) return null;

      let normal: THREE.Vector3 | undefined;
      if (hit.face) {
        normal = hit.face.normal.clone();
        const m3 = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
        normal.applyMatrix3(m3).normalize();
      }

      return {
        kind: "glb",
        point: hit.point,
        normal,
        distance: hit.distance,
        object: hit.object,
      };
    }

    return null;
  }

  private armSectionMaterialsRefresh(style: "hover" | "select") {
    if (!this.sectionMaterialsRefreshArmed.has(style)) return;
    this.sectionMaterialsRefreshArmed.delete(style);
    this.sectionMaterialsNeedRefresh = true;
  }

  private refreshSectionMaterialsIfNeeded() {
    if (!this.section.getEnabled()) return;
    if (!this.sectionMaterialsNeedRefresh) return;

    this.sectionMaterialsNeedRefresh = false;

    // Materials for the model are registered on load, but highlighter/selection may create
    // new internal materials lazily. Re-scan loaded models once when needed.
    for (const model of this.fragments.list.values()) {
      this.section.registerMaterialsFrom(model.object);
    }
  }

  private disposeGlbRoot() {
    const root = this.glbRoot;
    if (!root) return;

    // Collect first so we can dispose safely after traversal.
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    const collectTextures = (mat: THREE.Material) => {
      const anyMat = mat as unknown as Record<string, unknown>;
      for (const v of Object.values(anyMat)) {
        if (!v || typeof v !== "object") continue;
        const maybeTex = v as THREE.Texture & { isTexture?: boolean };
        if (maybeTex.isTexture) textures.add(maybeTex);
      }
    };

    root.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const geom = mesh.geometry as THREE.BufferGeometry | undefined;
      if (geom) geometries.add(geom);

      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if (!m) continue;
          materials.add(m);
          collectTextures(m);
        }
      } else if (mat) {
        materials.add(mat);
        collectTextures(mat);
      }
    });

    root.removeFromParent();
    this.glbRoot = null;
    this.glbBounds = null;

    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();
  }

  private async settleOrWarn(task: Promise<unknown>, timeoutMs: number, label: string) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    try {
      await Promise.race([
        task,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            timedOut = true;
            resolve();
          }, timeoutMs);
        }),
      ]);
      if (timedOut) {
        console.warn(`[ViewerApp] ${label} timed out after ${timeoutMs}ms.`);
      }
    } catch (err) {
      console.warn(`[ViewerApp] ${label} failed.`, err);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private updateCameraBoundsFromBox(box: THREE.Box3) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const diag = Math.max(size.length(), 1);

    this.cameraGroundZ = box.min.z + Math.max(0.02, size.z * 0.01);

    const controls = this.cameraComponent.controls;
    controls.minDistance = Math.max(0.2, diag * 0.01);
    controls.maxDistance = Math.max(200, diag * 20);
  }

  private clampCameraAboveGround() {
    if (this.cameraGroundZ == null) return;

    const controls = this.cameraComponent.controls;
    const pos = controls.getPosition(this.tmpCamPos);
    const target = controls.getTarget(this.tmpCamTarget);

    let changed = false;
    if (pos.z < this.cameraGroundZ) {
      pos.z = this.cameraGroundZ;
      changed = true;
    }
    if (target.z < this.cameraGroundZ) {
      target.z = this.cameraGroundZ;
      changed = true;
    }

    if (changed) {
      void controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false);
    }
  }

  async clearHover() {
    useViewerStore.getState().setHovered(null);
    await this.settleOrWarn(this.highlighter.clear("hover"), 4000, "highlighter.clear(hover)");
  }

  async hoverFromPointerEvent(ev: PointerEvent) {
    const hit = await this.raycastFromPointerEvent(ev);
    const prev = useViewerStore.getState().hovered;

    if (!hit || hit.kind !== "ifc" || hit.modelId == null || hit.localId == null) {
      if (prev) await this.clearHover();
      return;
    }

    const key: ViewerSelectionKey = { modelId: hit.modelId, localId: hit.localId };
    if (prev && prev.modelId === key.modelId && prev.localId === key.localId) return;

    useViewerStore.getState().setHovered(key);

    const exclude = rawToModelIdMap(useViewerStore.getState().selection);
    this.armSectionMaterialsRefresh("hover");
    await this.highlighter.highlightByID("hover", { [key.modelId]: new Set([key.localId]) }, true, false, exclude);
    this.refreshSectionMaterialsIfNeeded();
  }

  private async selectFromKey(key: ViewerSelectionKey, opts: { multi: boolean }) {
    const currentRaw = useViewerStore.getState().selection;
    const raw = structuredClone(currentRaw) as RawModelIdMap;
    const list = raw[key.modelId] ?? [];

    const already = list.includes(key.localId);
    if (!opts.multi) {
      raw[key.modelId] = [key.localId];
      for (const m of Object.keys(raw)) {
        if (m !== key.modelId) delete raw[m];
      }
    } else {
      raw[key.modelId] = already ? list.filter((x) => x !== key.localId) : [...list, key.localId];
      if (raw[key.modelId].length === 0) delete raw[key.modelId];
    }

    const map = rawToModelIdMap(raw);
    if (isEmptyMap(map)) {
      await this.clearSelection();
      return;
    }

    useViewerStore.getState().setSelection(raw, key);
    this.armSectionMaterialsRefresh("select");
    await this.highlighter.highlightByID("select", map, true, false);
    this.refreshSectionMaterialsIfNeeded();
    await this.cameraComponent.setOrbitToItems(map);
    await this.updateProperties(key);
  }

  async selectFromPointerEvent(ev: PointerEvent, opts: { multi: boolean }) {
    const hit = await this.raycastFromPointerEvent(ev);
    if (!hit || hit.kind !== "ifc" || hit.modelId == null || hit.localId == null) {
      if (!opts.multi) await this.clearSelection();
      return;
    }
    const key: ViewerSelectionKey = { modelId: hit.modelId, localId: hit.localId };
    await this.selectFromKey(key, opts);
  }

  async selectElement(key: ViewerSelectionKey, opts?: { multi?: boolean }) {
    await this.selectFromKey(key, { multi: Boolean(opts?.multi) });
  }

  async clearSelection() {
    useViewerStore.getState().setSelection({}, null);
    useViewerStore.getState().setProperties(null);
    await this.settleOrWarn(this.highlighter.clear("select"), 4000, "highlighter.clear(select)");
  }

  async frameSelection() {
    const raw = useViewerStore.getState().selection;
    const map = rawToModelIdMap(raw);
    if (isEmptyMap(map)) return;
    await this.cameraComponent.fitToItems(map);
  }

  async frameModel() {
    // Fit camera to loaded model(s).
    // For IFC we can fit to the world's meshes; for GLB we collect meshes from the loaded root.
    if (this.fragments.list.size > 0) {
      await this.cameraComponent.fit(this.world.meshes, 1.2);
      return;
    }

    if (this.glbRoot) {
      const meshes: THREE.Mesh[] = [];
      this.glbRoot.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) meshes.push(mesh);
      });
      if (meshes.length > 0) await this.cameraComponent.fit(meshes, 1.2);
    }
  }

  async loadIfcFromUrl(url: string, name: string) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch IFC (${resp.status})`);
    const buffer = await resp.arrayBuffer();
    await this.loadIfcFromBuffer(buffer, name);
  }

  async loadGlbFromUrl(url: string, name: string) {
    const timeoutMs = 120000;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);

    useViewerStore.getState().setLoading({ active: true, label: "Downloading GLB...", progress: 0 });
    useViewerStore.getState().setModelName(name);

    try {
      const resp = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (!resp.ok) throw new Error(`Failed to fetch GLB (${resp.status}) from ${url}`);

      let buffer: ArrayBuffer;
      const contentLength = Number(resp.headers.get("content-length") ?? "0");
      if (resp.body && Number.isFinite(contentLength) && contentLength > 0) {
        const reader = resp.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          chunks.push(value);
          loaded += value.byteLength;
          useViewerStore.getState().setLoading({
            active: true,
            label: "Downloading GLB...",
            progress: Math.min(0.95, loaded / contentLength),
          });
        }
        const merged = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        buffer = merged.buffer;
      } else {
        buffer = await resp.arrayBuffer();
      }

      useViewerStore.getState().setLoading({ active: true, label: "Parsing GLB...", progress: 0.05 });
      await this.loadGlbFromBuffer(buffer, name);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`Timed out fetching GLB after ${Math.round(timeoutMs / 1000)}s (${url})`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      useViewerStore.getState().setLoading({ active: false, label: "", progress: 1 });
    }
  }

  async loadGlbFromBuffer(buffer: ArrayBuffer, name: string) {
    useViewerStore.getState().setLoading({ active: true, label: "Loading GLB...", progress: 0 });
    useViewerStore.getState().setModelName(name);

    try {
      useViewerStore.getState().setLoading({
        active: true,
        label: "Loading GLB... clearing selection",
        progress: 0.02,
      });
      await this.clearSelection();
      await this.clearHover();
      this.measurements.clear();
      useViewerStore.getState().clearMeasurements();

      // Reset section-material bookkeeping for the new model.
      this.sectionMaterialsNeedRefresh = false;
      this.sectionMaterialsRefreshArmed = new Set<"hover" | "select">(["hover", "select"]);

      // Dispose previous models (if any).
      this.section.clearMaterials();
      this.disposeGlbRoot();
      useViewerStore.getState().setLoading({
        active: true,
        label: "Loading GLB... disposing previous model",
        progress: 0.05,
      });
      for (const model of this.fragments.list.values()) {
        this.scene.remove(model.object);
        await this.settleOrWarn(
          model.dispose(),
          12000,
          `fragments model dispose (${model.modelId ?? "unknown"})`
        );
      }

      this.classGroupItems.clear();
      this.storeyGroupItems.clear();
      useViewerStore.getState().setClassGroups([]);
      useViewerStore.getState().setStoreyGroups([]);
      this.manualHidden = emptyModelIdMap();
      this.isolateActive = false;
      this.hiddenBeforeIsolateRaw = null;

      const loader = new GLTFLoader();
      const parseTimeoutMs = 120000;
      useViewerStore.getState().setLoading({ active: true, label: "Parsing GLB...", progress: 0.1 });
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timed out parsing GLB after ${Math.round(parseTimeoutMs / 1000)}s.`));
        }, parseTimeoutMs);
        loader.parse(
          buffer,
          "",
          (g) => {
            clearTimeout(timer);
            resolve(g);
          },
          (err) =>
            {
              clearTimeout(timer);
              reject(err instanceof Error ? err : new Error("Failed to parse GLB."));
            } // normalize
        );
      });

      await this.finishGlbLoad(gltf, name);
      toast.success("Model loaded", {
        description: `${name} (visual model, no BIM metadata)`,
      });
    } finally {
      useViewerStore.getState().setLoading({ active: false, label: "", progress: 1 });
    }
  }

  async loadIfcFromBuffer(buffer: ArrayBuffer, name: string) {
    await this.ensureIfcPipeline();

    useViewerStore.getState().setLoading({ active: true, label: "Loading IFC...", progress: 0 });
    useViewerStore.getState().setModelName(name);

    await this.clearSelection();
    await this.clearHover();
    this.measurements.clear();
    useViewerStore.getState().clearMeasurements();

    // Reset section-material bookkeeping for the new model.
    this.sectionMaterialsNeedRefresh = false;
    this.sectionMaterialsRefreshArmed = new Set<"hover" | "select">(["hover", "select"]);

    // Dispose previous models (if any).
    this.section.clearMaterials();
    this.disposeGlbRoot();
    for (const model of this.fragments.list.values()) {
      this.scene.remove(model.object);
      await this.settleOrWarn(
        model.dispose(),
        12000,
        `fragments model dispose (${model.modelId ?? "unknown"})`
      );
    }

    this.classGroupItems.clear();
    this.storeyGroupItems.clear();
    this.manualHidden = emptyModelIdMap();
    this.isolateActive = false;
    this.hiddenBeforeIsolateRaw = null;

    const data = new Uint8Array(buffer);
    const model = await this.ifcLoader.load(data, true, name, {
      processData: {
        progressCallback: (progress) => {
          useViewerStore.getState().setLoading({
            active: true,
            label: "Converting IFC...",
            progress,
          });
        },
      },
    });

    // Provide clipping planes to worker threads so raycasting respects sectioning.
    model.getClippingPlanesEvent = () => this.section.getActivePlanes();

    // Add model to scene.
    this.scene.add(model.object);

    // Build BVH for fast picking. Disable rendering while buffers are transferred to the worker.
    useViewerStore.getState().setLoading({ active: true, label: "Building BVH...", progress: 0 });
    const prevRendererEnabled = this.rendererComponent.enabled;
    this.rendererComponent.enabled = false;
    model.object.visible = false;

    try {
      await this.bvh.buildForObject(model.object, {
        onProgress: ({ total, done }) => {
          useViewerStore.getState().setLoading({
            active: true,
            label: `Building BVH... (${done}/${total})`,
            progress: total === 0 ? 1 : done / total,
          });
        },
      });
    } finally {
      model.object.visible = true;
      this.rendererComponent.enabled = prevRendererEnabled;
    }

    // Register materials for clipping (after BVH so we don't fight buffer transfers).
    this.section.registerMaterialsFrom(model.object);

    await this.frameModel();

    // Populate class + storey groups for UI (tree/filters).
    await this.buildGroupsForModel(model);

    useViewerStore.getState().setLoading({ active: false, label: "", progress: 1 });
    toast.success("Model loaded", { description: name });
  }

  private async finishGlbLoad(gltf: GLTF, name: string) {
    useViewerStore.getState().setLoading({ active: true, label: "Preparing scene...", progress: 1 });

    const root = gltf.scene ?? new THREE.Group();
    root.name = `GLB:${name}`;
    root.updateWorldMatrix(true, true);

    this.scene.add(root);
    this.glbRoot = root;

    const box = new THREE.Box3().setFromObject(root);
    this.glbBounds = box.clone();
    this.updateCameraBoundsFromBox(box);

    // Section plane bounds from model bounding box + reset section box.
    const center = new THREE.Vector3();
    box.getCenter(center);
    useViewerStore.getState().setSectionPlane({
      min: box.min.z,
      max: box.max.z,
      offset: center.z,
      axis: "z",
    });
    this.section.setPlaneBounds(box.min.z, box.max.z);
    this.section.setPlaneAxis("z");
    this.section.setPlaneOffset(center.z);
    this.section.resetBoxToBounds(box);

    // Register materials for clipping and frame quickly so the user can interact immediately.
    this.section.registerMaterialsFrom(root);
    await this.frameModel();

    // Build BVH asynchronously in the background so large GLBs appear fast.
    void this.bvh.buildForObject(root).catch((err) => {
      console.warn("Background GLB BVH build failed.", err);
    });
  }

  private async buildGroupsForModel(model: FRAGS.FragmentsModel) {
    // Classes by IFC category.
    const cats = await model.getItemsOfCategories([/.*/i]);
    const classGroups = Object.entries(cats)
      .map(([category, ids]) => ({
        id: category,
        label: friendlyIfcLabel(category),
        count: ids.length,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    for (const [category, ids] of Object.entries(cats)) {
      this.classGroupItems.set(category, { [model.modelId]: new Set(ids) });
    }
    useViewerStore.getState().setClassGroups(classGroups);

    // Storeys by spatial structure (IFCBUILDINGSTOREY).
    const spatial = await model.getSpatialStructure();
    const geomIds = new Set(await model.getItemsIdsWithGeometry());

    const storeys: Array<{ localId: number; ids: number[] }> = [];
    const walk = (node: FRAGS.SpatialTreeItem) => {
      const cat = node.category ?? "";
      const lid = node.localId;
      if (lid != null && /IFCBUILDINGSTOREY/i.test(cat)) {
        const ids: number[] = [];
        const collect = (n: FRAGS.SpatialTreeItem) => {
          if (n.localId != null && geomIds.has(n.localId)) ids.push(n.localId);
          if (n.children) for (const c of n.children) collect(c);
        };
        if (node.children) for (const c of node.children) collect(c);
        storeys.push({ localId: lid, ids: Array.from(new Set(ids)) });
      }
      if (node.children) for (const c of node.children) walk(c);
    };
    walk(spatial);

    const storeyGroups = [];
    for (const s of storeys) {
      const itemData = (await model.getItemsData([s.localId], { attributesDefault: true }))[0];
      const name = getAttr(itemData, "Name") ?? `Storey ${s.localId}`;
      const id = String(s.localId);
      storeyGroups.push({ id, label: name, count: s.ids.length });
      this.storeyGroupItems.set(id, { [model.modelId]: new Set(s.ids) });
    }
    storeyGroups.sort((a, b) => a.label.localeCompare(b.label));
    useViewerStore.getState().setStoreyGroups(storeyGroups);

    // Section plane bounds from model bounding box.
    const box = model.box.clone();
    this.updateCameraBoundsFromBox(box);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const min = box.min;
    const max = box.max;
    useViewerStore.getState().setSectionPlane({
      min: min.z,
      max: max.z,
      offset: center.z,
      axis: "z",
    });
    this.section.setPlaneBounds(min.z, max.z);
    this.section.setPlaneAxis("z");
    this.section.setPlaneOffset(center.z);

    // Initialize section box to cover the model (even if disabled by default).
    this.section.resetBoxToBounds(box);
  }

  async hideSelected() {
    const raw = useViewerStore.getState().selection;
    const map = rawToModelIdMap(raw);
    if (isEmptyMap(map)) return;

    await this.hider.set(false, map);
    addToMap(this.manualHidden, map);
    await this.clearSelection();
    toast("Hidden objects", { description: `Hidden ${countModelIdMap(map)} item(s).` });
  }

  async isolateSelected() {
    const raw = useViewerStore.getState().selection;
    const map = rawToModelIdMap(raw);
    if (isEmptyMap(map)) return;

    if (!this.isolateActive) {
      this.hiddenBeforeIsolateRaw = await this.hider.getVisibilityMap(false);
      await this.hider.isolate(map);
      this.isolateActive = true;
      toast("Isolation", { description: `Isolated ${countModelIdMap(map)} item(s).` });
    } else {
      await this.restoreIsolation();
    }
  }

  private async restoreIsolation() {
    this.isolateActive = false;
    this.hiddenBeforeIsolateRaw = null;
    await this.applyVisibilityFromState();
    toast("Isolation", { description: "Restored previous visibility." });
  }

  async unhideAll() {
    await this.hider.set(true);
    this.manualHidden = emptyModelIdMap();
    this.isolateActive = false;
    this.hiddenBeforeIsolateRaw = null;
    useViewerStore.getState().resetFilters();
    toast("Visibility", { description: "All objects visible." });
  }

  async setClassVisible(groupId: string, visible: boolean) {
    useViewerStore.getState().setClassVisibility(groupId, visible);
    await this.applyVisibilityFromState();
  }

  async setStoreyVisible(groupId: string, visible: boolean) {
    useViewerStore.getState().setStoreyVisibility(groupId, visible);
    await this.applyVisibilityFromState();
  }

  private async applyVisibilityFromState() {
    if (this.isolateActive) return;

    const s = useViewerStore.getState();
    const hide: ModelIdMap = emptyModelIdMap();

    for (const [id, items] of this.classGroupItems) {
      if (s.classVisibility[id] === false) addToMap(hide, items);
    }
    for (const [id, items] of this.storeyGroupItems) {
      if (s.storeyVisibility[id] === false) addToMap(hide, items);
    }
    addToMap(hide, this.manualHidden);

    await this.hider.set(true);
    if (!isEmptyMap(hide)) await this.hider.set(false, hide);
  }

  async selectGroup(group: { type: "class" | "storey"; id: string }) {
    const map =
      group.type === "class"
        ? this.classGroupItems.get(group.id)
        : this.storeyGroupItems.get(group.id);
    if (!map) return;
    const raw = modelIdMapToRaw(map);
    const firstModelId = Object.keys(raw)[0];
    const firstLocalId = raw[firstModelId]?.[0];
    const primary =
      firstModelId && typeof firstLocalId === "number"
        ? { modelId: firstModelId, localId: firstLocalId }
        : null;
    useViewerStore.getState().setSelection(raw, primary);
    this.armSectionMaterialsRefresh("select");
    await this.highlighter.highlightByID("select", map, true, false);
    this.refreshSectionMaterialsIfNeeded();
    if (primary) await this.updateProperties(primary);
  }

  addMeasurement(start: THREE.Vector3, end: THREE.Vector3) {
    const id = this.measurements.add(start, end);
    useViewerStore.getState().setMeasurements(
      this.measurements.list().map((m) => ({
        id: m.id,
        start: [m.start.x, m.start.y, m.start.z],
        end: [m.end.x, m.end.y, m.end.z],
        meters: m.meters,
      }))
    );
    toast("Measurement added", { description: "Distance measurement created." });
    return id;
  }

  removeMeasurement(id: string) {
    this.measurements.remove(id);
    useViewerStore.getState().removeMeasurement(id);
  }

  clearMeasurements() {
    this.measurements.clear();
    useViewerStore.getState().clearMeasurements();
  }

  setSectionEnabled(enabled: boolean) {
    useViewerStore.getState().setSection({ enabled });
    this.section.setEnabled(enabled);
    if (enabled) this.refreshSectionMaterialsIfNeeded();
  }

  setSectionMode(mode: "box" | "plane") {
    useViewerStore.getState().setSection({ mode });
    this.section.setMode(mode);
  }

  setSectionInvert(invert: boolean) {
    useViewerStore.getState().setSection({ invert });
    this.section.setInvert(invert);
  }

  setSectionPlane(axis: "x" | "y" | "z", offset: number) {
    const first = [...this.fragments.list.values()][0];
    const box = first?.box ?? this.glbBounds;

    if (box) {
      const min = axis === "x" ? box.min.x : axis === "y" ? box.min.y : box.min.z;
      const max = axis === "x" ? box.max.x : axis === "y" ? box.max.y : box.max.z;
      const clamped = Math.min(Math.max(offset, min), max);
      useViewerStore.getState().setSectionPlane({ axis, min, max, offset: clamped });
      this.section.setPlaneBounds(min, max);
      this.section.setPlaneAxis(axis);
      this.section.setPlaneOffset(clamped);
      return;
    }
    useViewerStore.getState().setSectionPlane({ axis, offset });
    this.section.setPlaneAxis(axis);
    this.section.setPlaneOffset(offset);
  }

  resetSectionBox() {
    // Reset to the current model bbox (IFC first, else GLB).
    const first = [...this.fragments.list.values()][0];
    if (first) {
      this.section.resetBoxToBounds(first.box);
      return;
    }
    if (this.glbBounds) this.section.resetBoxToBounds(this.glbBounds);
  }

  enableSectionEditing(active: boolean) {
    const s = useViewerStore.getState().section;
    if (active) {
      if (!s.enabled) {
        this.setSectionEnabled(true);
      }
      if (s.mode !== "box") {
        this.setSectionMode("box");
      }
    }
    this.section.setBoxEditing(active);
    if (!active) this.cameraComponent.enabled = true;
  }

  setSectionTransformMode(mode: "translate" | "rotate" | "scale") {
    this.section.setTransformMode(mode);
  }

  async reset() {
    // Keep this a "single-click safety reset" like BIM tools.
    await this.setActiveTool("select");
    await this.hider.set(true);
    this.manualHidden = emptyModelIdMap();
    this.isolateActive = false;
    this.hiddenBeforeIsolateRaw = null;
    useViewerStore.getState().resetFilters();

    this.setSectionInvert(false);
    this.setSectionMode("box");
    this.setSectionEnabled(false);
    this.section.setBoxEditing(false);
    this.resetSectionBox();

    this.clearMeasurements();
    await this.clearSelection();
    await this.clearHover();
    await this.frameModel();

    toast("Reset", { description: "Viewer state reset." });
  }

  async updateProperties(key: ViewerSelectionKey) {
    const model = this.fragments.list.get(key.modelId);
    if (!model) {
      useViewerStore.getState().setProperties(null);
      return;
    }

    const item = model.getItem(key.localId);
    const [guid, category, rawData] = await Promise.all([
      item.getGuid(),
      item.getCategory(),
      // Use fragments core to get rich data (relations + attributes).
      item.getData(),
    ]);

    const name = getAttr(rawData, "Name") ?? getAttr(rawData, "LongName");
    const tag = getAttr(rawData, "Tag");

    // Compact attributes: top-level simple values.
    const attributes: Array<{ name: string; value: string }> = [];
    for (const [k, v] of Object.entries(isRecord(rawData) ? rawData : {})) {
      if (Array.isArray(v)) continue;
      if (isRecord(v) && !("value" in v)) continue;
      const vv = toStringValue(v);
      if (!vv) continue;
      attributes.push({ name: k, value: vv });
    }
    attributes.sort((a, b) => a.name.localeCompare(b.name));

    const psets: PropertiesPayload["psets"] = [];
    collectPsetsDeep(rawData, psets);
    // De-dup by name, keep the one with most props.
    const byName = new Map<string, (typeof psets)[number]>();
    for (const p of psets) {
      const prev = byName.get(p.name);
      if (!prev || p.props.length > prev.props.length) byName.set(p.name, p);
    }
    const finalPsets = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

    useViewerStore.getState().setProperties({
      modelId: key.modelId,
      localId: key.localId,
      guid,
      category,
      name,
      tag,
      psets: finalPsets,
      attributes,
    });
  }

  async search(query: string) {
    const q = query.trim();
    if (!q) return [];
    const re = new RegExp(escapeRegExp(q), "i");

    const results: Array<ViewerSelectionKey & { label: string }> = [];
    for (const model of this.fragments.list.values()) {
      const byAttr = await model.getItemsByQuery({
        attributes: {
          aggregation: "inclusive",
          queries: [
            { name: /^Name$/i, value: re },
            { name: /^Tag$/i, value: re },
            { name: /^ObjectType$/i, value: re },
          ],
        },
      });
      const byCat = await model.getItemsByQuery({ categories: [re] });

      const ids = Array.from(new Set([...byAttr, ...byCat])).slice(0, 50);
      const data = await model.getItemsData(ids, { attributesDefault: true });
      for (let i = 0; i < ids.length; i++) {
        const lid = ids[i];
        const d = data[i];
        const name = getAttr(d, "Name") ?? `Item ${lid}`;
        const cat = await model.getItem(lid).getCategory();
        results.push({
          modelId: model.modelId,
          localId: lid,
          label: `${name} (${cat ?? "Unknown"})`,
        });
      }
    }
    return results;
  }
}
