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
import { CutTool } from "./tools/CutTool";
import { SectionBoxTool } from "./tools/SectionBoxTool";
import {
  type ViewerMeasurementMode,
  type ViewerPropertyFilterState,
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

function cloneModelIdMap(source: ModelIdMap): ModelIdMap {
  const out: ModelIdMap = {};
  for (const [modelId, ids] of Object.entries(source)) {
    out[modelId] = new Set(ids);
  }
  return out;
}

function subtractModelIdMap(a: ModelIdMap, b: ModelIdMap): ModelIdMap {
  const out: ModelIdMap = {};
  for (const [modelId, idsA] of Object.entries(a)) {
    const idsB = b[modelId];
    if (!idsB) {
      if (idsA.size > 0) out[modelId] = new Set(idsA);
      continue;
    }
    const diff = new Set<number>();
    for (const id of idsA) {
      if (!idsB.has(id)) diff.add(id);
    }
    if (diff.size > 0) out[modelId] = diff;
  }
  return out;
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

function parseNumeric(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function compareByOperator(
  candidate: string,
  operator: ViewerPropertyFilterState["operator"],
  expected: string
) {
  const c = candidate.trim();
  const e = expected.trim();

  if (operator === "contains") return c.toLowerCase().includes(e.toLowerCase());
  if (operator === "equals") return c.toLowerCase() === e.toLowerCase();
  if (operator === "not_equals") return c.toLowerCase() !== e.toLowerCase();

  const cn = parseNumeric(c);
  const en = parseNumeric(e);
  if (cn == null || en == null) return false;
  if (operator === "gt") return cn > en;
  if (operator === "lt") return cn < en;
  if (operator === "gte") return cn >= en;
  if (operator === "lte") return cn <= en;
  return false;
}

function closestPointsBetweenBoxes(a: THREE.Box3, b: THREE.Box3) {
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const axes: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  for (const ax of axes) {
    if (a.max[ax] < b.min[ax]) {
      pA[ax] = a.max[ax];
      pB[ax] = b.min[ax];
      continue;
    }
    if (b.max[ax] < a.min[ax]) {
      pA[ax] = a.min[ax];
      pB[ax] = b.max[ax];
      continue;
    }
    // Overlap in this axis: project both points to the overlapping interval.
    const v = (Math.max(a.min[ax], b.min[ax]) + Math.min(a.max[ax], b.max[ax])) * 0.5;
    pA[ax] = v;
    pB[ax] = v;
  }
  return { pA, pB, distance: pA.distanceTo(pB) };
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

type ViewerViewPreset = "top" | "bottom" | "front" | "left" | "right" | "back";

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
  private glbHoveredObject: THREE.Object3D | null = null;
  private glbSelectedObject: THREE.Object3D | null = null;
  private glbIsolateSnapshot: Map<THREE.Object3D, boolean> | null = null;
  private readonly glbHoverHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color("#0ea5e9"));
  private readonly glbSelectHelper = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color("#f97316"));

  // Classification groups for fast filters/tree.
  private classGroupItems = new Map<string, ModelIdMap>();
  private storeyGroupItems = new Map<string, ModelIdMap>();
  private classByItemByModel = new Map<string, Map<number, string>>();
  private itemBoxesByModel = new Map<string, Map<number, THREE.Box3>>();
  private itemCutSamplesByModel = new Map<
    string,
    Array<{ localId: number; sampleX: number; sampleZ: number; classId?: string }>
  >();

  private cutHidden: ModelIdMap = emptyModelIdMap();
  private filteredOut: ModelIdMap = emptyModelIdMap();

  private previousIfcSnapshot: Map<
    string,
    { name: string; tag: string; category: string; modelName: string }
  > | null = null;
  private measurementMeta = new Map<
    string,
    { mode: Exclude<ViewerMeasurementMode, "coords">; note?: string }
  >();

  private fragmentsInitialized = false;
  private ifcInitialized = false;

  private manualHidden: ModelIdMap = emptyModelIdMap();
  private appliedHidden: ModelIdMap = emptyModelIdMap();
  private visibilityForceFullApply = true;
  private isolateActive = false;
  private hiddenBeforeIsolateRaw: Record<string, number[]> | null = null;

  private disposed = false;

  private statsFrames = 0;
  private statsT0 = performance.now();
  private statsUnsub?: () => void;

  // Keep navigation above model "ground" and scale camera limits per model size.
  private cameraGroundZ: number | null = null;
  private cameraBoundsCenter: THREE.Vector3 | null = null;
  private cameraBoundsDiag = 1;
  private tmpCamPos = new THREE.Vector3();
  private tmpCamTarget = new THREE.Vector3();
  private tmpCamDelta = new THREE.Vector3();

  // Highlighter creates its own materials; when sectioning is enabled we need to ensure
  // those materials also receive the active clipping planes.
  private sectionMaterialsNeedRefresh = false;
  private sectionMaterialsRefreshArmed = new Set<"hover" | "select">(["hover", "select"]);
  private hoverRequestSerial = 0;
  private hasHoverHighlight = false;
  private hasSelectHighlight = false;
  private hoverClearInFlight: Promise<void> | null = null;
  private selectClearInFlight: Promise<void> | null = null;
  private cutBounds: { xMin: number; xMax: number; zMin: number; zMax: number } | null = null;
  private cutApplyRaf = 0;
  private cutApplyQueued = false;
  private cutApplyInFlight = false;

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

    // camera-controls tuning for Dalux-like BIM navigation.
    const controls = this.cameraComponent.controls;
    controls.smoothTime = 0.1;
    controls.draggingSmoothTime = 0.12;
    controls.dollySpeed = 0.9;
    controls.truckSpeed = 1.5;
    controls.azimuthRotateSpeed = 0.7;
    controls.polarRotateSpeed = 0.7;
    controls.dollyToCursor = true;
    controls.infinityDolly = false;
    controls.boundaryFriction = 0.15;
    controls.minPolarAngle = 0.01;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 0.5;
    controls.maxDistance = 5000;
    controls.minZoom = 0.05;
    controls.maxZoom = 200;
    controls.mouseButtons.left = CameraControls.ACTION.NONE;
    controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
    controls.mouseButtons.middle = CameraControls.ACTION.TRUCK;
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
    this.glbHoverHelper.name = "GLBHoverHelper";
    this.glbHoverHelper.visible = false;
    this.glbSelectHelper.name = "GLBSelectHelper";
    this.glbSelectHelper.visible = false;
    this.scene.add(this.glbHoverHelper);
    this.scene.add(this.glbSelectHelper);

    this.tools = new ToolManager(this);
    this.tools.register(new SelectTool());
    this.tools.register(new MeasureTool());
    this.tools.register(new CutTool());
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
    // ThatOpen registers a touchstart listener during setup; force passive to avoid
    // scroll-blocking listener warnings without patching node_modules.
    const restorePassiveTouch = this.forcePassiveTouchStart(this.rendererComponent.three.domElement);
    try {
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
    } finally {
      restorePassiveTouch();
    }
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
      this.recoverCameraIfOutOfBounds();

      this.statsFrames += 1;
      const now = performance.now();
      const dt = now - this.statsT0;
      if (dt < 500) return;

      const fps = Math.round((this.statsFrames * 1000) / dt);
      this.statsFrames = 0;
      this.statsT0 = now;

      const renderInfo = this.rendererComponent.three.info.render;
      const triangles = renderInfo.triangles;
      const drawCalls = renderInfo.calls;
      useViewerStore.getState().setStats({ fps, triangles, drawCalls });
    };
    this.world.onAfterUpdate.add(cb);
    this.statsUnsub = () => this.world.onAfterUpdate.remove(cb);

    // Section workflow defaults.
    this.section.setMode("box");
    this.section.setLockRotation(useViewerStore.getState().section.lockRotation);

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
    if (this.cutApplyRaf) cancelAnimationFrame(this.cutApplyRaf);
    this.cutApplyRaf = 0;
    this.cutApplyQueued = false;
    this.cutApplyInFlight = false;
    this.disposeGlbRoot();
    this.glbHoverHelper.removeFromParent();
    this.glbSelectHelper.removeFromParent();
    this.glbHoverHelper.box.makeEmpty();
    this.glbSelectHelper.box.makeEmpty();
    this.glbHoverHelper.geometry.dispose();
    this.glbSelectHelper.geometry.dispose();
    const hoverMaterial = this.glbHoverHelper.material;
    if (Array.isArray(hoverMaterial)) {
      for (const m of hoverMaterial) m.dispose();
    } else {
      hoverMaterial.dispose();
    }
    const selectMaterial = this.glbSelectHelper.material;
    if (Array.isArray(selectMaterial)) {
      for (const m of selectMaterial) m.dispose();
    } else {
      selectMaterial.dispose();
    }
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
    if (tool === "cut") this.setCursor(this.getCutCursor());
    this.noteHistory("tool", "Tool changed", tool);
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
      if (this.glbHoveredObject) {
        this.setGlbSelectedObject(this.glbHoveredObject, { updateProperties: true, noteHistory: true });
        await this.frameGlbObject(this.glbHoveredObject);
        return;
      }
      const sel = useViewerStore.getState().selection;
      if (Object.keys(sel).length > 0) {
        await this.frameSelection();
        return;
      }
      if (this.glbSelectedObject) {
        await this.frameGlbObject(this.glbSelectedObject);
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
    if (key === "q") {
      void this.setActiveTool("select");
      ev.preventDefault();
      return;
    }
    if (key === "m") {
      void this.setActiveTool("measure");
      ev.preventDefault();
      return;
    }
    if (key === "c") {
      void this.setActiveTool("cut");
      ev.preventDefault();
      return;
    }
    if (key === "b") {
      void this.setActiveTool("section");
      ev.preventDefault();
      return;
    }

    if (key === "f") {
      const sel = useViewerStore.getState().selection;
      if (Object.keys(sel).length > 0 || this.glbSelectedObject) void this.frameSelection();
      else void this.frameModel();
      ev.preventDefault();
      return;
    }

    if (key === "1") {
      void this.setViewMode("3d");
      ev.preventDefault();
      return;
    }
    if (key === "2") {
      void this.setViewMode("2d");
      ev.preventDefault();
      return;
    }
    if (key === "3") {
      void this.setViewPreset("top");
      ev.preventDefault();
      return;
    }
    if (key === "4") {
      void this.setViewPreset("front");
      ev.preventDefault();
      return;
    }
    if (key === "5") {
      void this.setViewPreset("left");
      ev.preventDefault();
      return;
    }
    if (key === "6") {
      void this.setViewPreset("right");
      ev.preventDefault();
      return;
    }
    if (key === "7") {
      void this.setViewPreset("back");
      ev.preventDefault();
      return;
    }
    if (key === "8") {
      void this.setViewPreset("bottom");
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
        this.noteHistory("tool", "Tool canceled", "Esc switched back to Select tool.");
      } else {
        void this.clearSelection();
      }
      ev.preventDefault();
      return;
    }

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
    this.glbHoveredObject = null;
    this.glbSelectedObject = null;
    this.glbIsolateSnapshot = null;
    this.glbHoverHelper.visible = false;
    this.glbSelectHelper.visible = false;
    this.glbHoverHelper.box.makeEmpty();
    this.glbSelectHelper.box.makeEmpty();

    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    for (const m of materials) m.dispose();
  }

  private async settleOrWarn(
    task: Promise<unknown>,
    timeoutMs: number,
    label: string,
    opts?: { warnOnTimeout?: boolean; warnOnReject?: boolean }
  ) {
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
      if (timedOut && opts?.warnOnTimeout !== false) {
        console.warn(`[ViewerApp] ${label} timed out after ${timeoutMs}ms.`);
      }
    } catch (err) {
      if (opts?.warnOnReject !== false) {
        console.warn(`[ViewerApp] ${label} failed.`, err);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private forcePassiveTouchStart(target: HTMLElement) {
    const original = target.addEventListener.bind(target) as (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean
    ) => void;
    const patched: typeof target.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: AddEventListenerOptions | boolean
    ) => {
      if (!listener) return;
      if (type !== "touchstart") {
        return original(type, listener, options);
      }

      if (options === undefined || options === false) {
        return original(type, listener, { passive: true });
      }
      if (options === true) {
        return original(type, listener, { capture: true, passive: true });
      }

      const opts = options as AddEventListenerOptions;
      if (opts.passive === undefined) {
        return original(type, listener, { ...opts, passive: true });
      }
      return original(type, listener, opts);
    }) as typeof target.addEventListener;

    target.addEventListener = patched;
    return () => {
      target.addEventListener = original as typeof target.addEventListener;
    };
  }

  private updateCameraBoundsFromBox(box: THREE.Box3, opts?: { syncCut?: boolean }) {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const diag = Math.max(size.length(), 1);

    this.cameraGroundZ = box.min.z + Math.max(0.02, size.z * 0.01);
    this.cameraBoundsCenter = center;
    this.cameraBoundsDiag = diag;

    const controls = this.cameraComponent.controls;
    controls.minDistance = Math.max(0.2, diag * 0.01);
    controls.maxDistance = Math.max(200, diag * 20);
    controls.setBoundary(box.clone().expandByScalar(diag * 4));

    const cam = this.cameraComponent.three;
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.near = Math.max(0.01, diag * 0.001);
      cam.far = Math.max(100, diag * 50);
      cam.updateProjectionMatrix();
    } else if (cam instanceof THREE.OrthographicCamera) {
      cam.near = Math.max(0.01, diag * 0.001);
      cam.far = Math.max(100, diag * 50);
      cam.updateProjectionMatrix();
    }

    if (opts?.syncCut !== false) {
      this.cutBounds = {
        xMin: box.min.x,
        xMax: box.max.x,
        zMin: box.min.z,
        zMax: box.max.z,
      };
      this.syncCutRangeForOrientation(useViewerStore.getState().cut.orientation, { center: true });
    }
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

  private isFiniteVector(v: THREE.Vector3) {
    return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  }

  private recoverCameraIfOutOfBounds() {
    const center = this.cameraBoundsCenter;
    if (!center) return;

    const controls = this.cameraComponent.controls;
    const pos = controls.getPosition(this.tmpCamPos);
    const target = controls.getTarget(this.tmpCamTarget);

    if (!this.isFiniteVector(pos) || !this.isFiniteVector(target)) {
      const dist = Math.max(this.cameraBoundsDiag * 1.4, 3);
      const dir = this.tmpCamDelta.set(1, -1, 0.75).normalize();
      const nextPos = center.clone().addScaledVector(dir, dist);
      void controls.setLookAt(nextPos.x, nextPos.y, nextPos.z, center.x, center.y, center.z, false);
      return;
    }

    let changed = false;
    const maxTargetDrift = Math.max(this.cameraBoundsDiag * 8, 20);
    if (target.distanceTo(center) > maxTargetDrift) {
      target.lerp(center, 0.65);
      changed = true;
    }

    const cameraDistance = pos.distanceTo(target);
    const maxDistance = Math.max(this.cameraBoundsDiag * 12, controls.maxDistance * 1.2);
    if (cameraDistance > maxDistance) {
      const dir = this.tmpCamDelta.copy(pos).sub(target);
      if (dir.lengthSq() < 1e-8) dir.set(1, -1, 0.75);
      dir.normalize().multiplyScalar(Math.max(this.cameraBoundsDiag * 2.5, controls.maxDistance * 0.85));
      pos.copy(target).add(dir);
      changed = true;
    }

    if (changed) {
      void controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, false);
    }
  }

  private noteHistory(
    type:
      | "selection"
      | "visibility"
      | "properties"
      | "measurement"
      | "filter"
      | "revision"
      | "tool"
      | "load",
    title: string,
    details?: string
  ) {
    useViewerStore.getState().pushHistory({ type, title, details });
  }

  private async yieldToMainThread() {
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(() => resolve(), 0);
      }
    });
  }

  private queueApplyCut() {
    if (this.disposed) return;
    this.cutApplyQueued = true;
    if (this.cutApplyRaf) return;

    this.cutApplyRaf = requestAnimationFrame(() => {
      this.cutApplyRaf = 0;
      void this.flushCutQueue();
    });
  }

  private async flushCutQueue() {
    if (this.cutApplyInFlight || this.disposed) return;
    this.cutApplyInFlight = true;
    try {
      while (this.cutApplyQueued && !this.disposed) {
        this.cutApplyQueued = false;
        await this.applyCutFromState();
      }
    } finally {
      this.cutApplyInFlight = false;
    }
  }

  private hasIfcModels() {
    return this.fragments.list.size > 0;
  }

  private updateGlbHelper(helper: THREE.Box3Helper, object: THREE.Object3D | null) {
    if (!object || !this.glbRoot) {
      helper.visible = false;
      return;
    }
    helper.box.setFromObject(object);
    helper.visible = !helper.box.isEmpty();
  }

  private setGlbHoveredObject(object: THREE.Object3D | null) {
    if (this.glbHoveredObject === object) return;
    this.glbHoveredObject = object;
    this.updateGlbHelper(this.glbHoverHelper, object);
  }

  private buildGlbProperties(object: THREE.Object3D): PropertiesPayload {
    const mesh = object as THREE.Mesh;
    const worldPos = object.getWorldPosition(new THREE.Vector3());
    const attributes: Array<{ name: string; value: string }> = [
      { name: "Source", value: "GLB visual model" },
      { name: "ObjectType", value: object.type },
      { name: "UUID", value: object.uuid },
      {
        name: "World Position",
        value: `${worldPos.x.toFixed(3)}, ${worldPos.y.toFixed(3)}, ${worldPos.z.toFixed(3)}`,
      },
    ];

    if (mesh.isMesh) {
      const geom = mesh.geometry as THREE.BufferGeometry | undefined;
      if (geom) {
        const triCount =
          geom.index != null
            ? Math.round(geom.index.count / 3)
            : geom.attributes.position
              ? Math.round(geom.attributes.position.count / 3)
              : 0;
        attributes.push({ name: "Triangles", value: triCount.toLocaleString() });
      }

      const mat = mesh.material;
      if (Array.isArray(mat)) {
        const names = mat.map((m) => m?.name).filter(Boolean);
        if (names.length > 0) attributes.push({ name: "Materials", value: names.join(", ") });
      } else if (mat?.name) {
        attributes.push({ name: "Material", value: mat.name });
      }
    }

    attributes.sort((a, b) => a.name.localeCompare(b.name));

    return {
      modelId: "__glb__",
      localId: object.id,
      guid: null,
      category: object.type,
      name: object.name || `${object.type} ${object.id}`,
      tag: null,
      psets: [],
      attributes,
    };
  }

  private setGlbSelectedObject(
    object: THREE.Object3D | null,
    opts?: { updateProperties?: boolean; noteHistory?: boolean }
  ) {
    if (this.glbSelectedObject === object) return;
    this.glbSelectedObject = object;
    this.updateGlbHelper(this.glbSelectHelper, object);

    if (opts?.updateProperties !== false) {
      useViewerStore.getState().setProperties(object ? this.buildGlbProperties(object) : null);
      if (object) useViewerStore.getState().setRightPanelTab("properties");
    }

    if (object && opts?.noteHistory !== false) {
      this.noteHistory("selection", "GLB object selected", `${object.name || object.type} (#${object.id})`);
    }
  }

  private async frameGlbObject(object: THREE.Object3D) {
    const meshes = this.collectMeshesFromObject(object);
    if (meshes.length === 0) {
      await this.frameModel();
      return;
    }

    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) {
      await this.frameModel();
      return;
    }

    this.updateCameraBoundsFromBox(bounds, { syncCut: false });
    await this.fitMeshesWithFallback(meshes, 1.12, bounds);
    this.centerCameraTargetToMeshes(meshes);
  }

  getCutCursor(orientation = useViewerStore.getState().cut.orientation) {
    return orientation === "horizontal" ? "ns-resize" : "ew-resize";
  }

  getCutState() {
    return useViewerStore.getState().cut;
  }

  private syncCutRangeForOrientation(
    orientation: "horizontal" | "vertical",
    opts?: { center?: boolean; preserveRatio?: boolean }
  ) {
    const bounds = this.cutBounds;
    if (!bounds) return;

    const min = orientation === "horizontal" ? bounds.zMin : bounds.xMin;
    const max = orientation === "horizontal" ? bounds.zMax : bounds.xMax;
    const span = max - min;
    const cut = useViewerStore.getState().cut;

    let offset = cut.offset;
    if (opts?.center || !Number.isFinite(offset)) {
      offset = min + span * 0.5;
    } else if (opts?.preserveRatio) {
      const prevSpan = cut.max - cut.min;
      const t = prevSpan > 1e-6 ? (cut.offset - cut.min) / prevSpan : 0.5;
      offset = min + THREE.MathUtils.clamp(t, 0, 1) * span;
    }
    offset = THREE.MathUtils.clamp(offset, min, max);

    useViewerStore.getState().setCut({ orientation, min, max, offset });
  }

  getMeasurementMode(): ViewerMeasurementMode {
    return useViewerStore.getState().measurementMode;
  }

  setMeasurementMode(mode: ViewerMeasurementMode) {
    useViewerStore.getState().setMeasurementMode(mode);
    this.noteHistory("tool", "Measurement mode", `Mode set to ${mode}.`);
  }

  setCoordinateReadout(point: THREE.Vector3) {
    useViewerStore.getState().setCoordinates({ x: point.x, y: point.y, z: point.z });
    this.noteHistory(
      "measurement",
      "Coordinate sampled",
      `X ${point.x.toFixed(3)}, Y ${point.y.toFixed(3)}, Z ${point.z.toFixed(3)}`
    );
  }

  noteShortestFrom(key: ViewerSelectionKey) {
    this.noteHistory(
      "measurement",
      "Shortest-distance pick A",
      `Model ${key.modelId}, local ID ${key.localId}`
    );
  }

  async clearHover() {
    this.hoverRequestSerial += 1;
    useViewerStore.getState().setHovered(null);
    this.setGlbHoveredObject(null);
    if (!this.hasHoverHighlight) return;
    if (!this.fragments.initialized || this.fragments.list.size === 0) {
      this.hasHoverHighlight = false;
      return;
    }

    if (this.hoverClearInFlight) {
      await this.hoverClearInFlight;
      return;
    }

    const clearTask = (async () => {
      await this.settleOrWarn(this.highlighter.clear("hover"), 1200, "highlighter.clear(hover)", {
        warnOnTimeout: false,
        warnOnReject: false,
      });
      this.hasHoverHighlight = false;
    })();
    this.hoverClearInFlight = clearTask.finally(() => {
      this.hoverClearInFlight = null;
    });
    await this.hoverClearInFlight;
  }

  async hoverFromPointerEvent(ev: PointerEvent) {
    const requestId = ++this.hoverRequestSerial;
    const hit = await this.raycastFromPointerEvent(ev);
    if (requestId !== this.hoverRequestSerial) return;

    const prev = useViewerStore.getState().hovered;

    if (!hit) {
      if (prev || this.hasHoverHighlight) await this.clearHover();
      return;
    }

    if (hit.kind === "glb") {
      if (prev || this.hasHoverHighlight) await this.clearHover();
      useViewerStore.getState().setHovered(null);
      this.setGlbHoveredObject(hit.object);
      return;
    }

    if (hit.modelId == null || hit.localId == null) {
      if (prev || this.hasHoverHighlight) await this.clearHover();
      return;
    }

    const key: ViewerSelectionKey = { modelId: hit.modelId, localId: hit.localId };
    if (prev && prev.modelId === key.modelId && prev.localId === key.localId) return;

    this.setGlbHoveredObject(null);
    useViewerStore.getState().setHovered(key);

    const exclude = rawToModelIdMap(useViewerStore.getState().selection);
    this.armSectionMaterialsRefresh("hover");
    await this.highlighter.highlightByID("hover", { [key.modelId]: new Set([key.localId]) }, true, false, exclude);
    if (requestId !== this.hoverRequestSerial) return;
    this.hasHoverHighlight = true;
    this.refreshSectionMaterialsIfNeeded();
  }

  private async selectFromKey(key: ViewerSelectionKey, opts: { multi: boolean }) {
    this.setGlbSelectedObject(null, { updateProperties: false, noteHistory: false });
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
    this.hasSelectHighlight = true;
    this.refreshSectionMaterialsIfNeeded();
    this.noteHistory(
      "selection",
      "Element selected",
      `Model ${key.modelId}, local ID ${key.localId}${opts.multi ? " (multi-select)" : ""}`
    );
    await this.updateProperties(key);
  }

  async selectFromPointerEvent(ev: PointerEvent, opts: { multi: boolean }) {
    const hit = await this.raycastFromPointerEvent(ev);
    if (!hit) {
      if (!opts.multi) await this.clearSelection();
      return;
    }

    if (hit.kind === "glb") {
      if (opts.multi) return;
      await this.clearSelection();
      this.setGlbSelectedObject(hit.object, { updateProperties: true, noteHistory: true });
      this.setGlbHoveredObject(hit.object);
      return;
    }

    if (hit.modelId == null || hit.localId == null) {
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
    this.setGlbSelectedObject(null, { updateProperties: false, noteHistory: false });
    if (!this.hasSelectHighlight) return;
    if (!this.fragments.initialized || this.fragments.list.size === 0) {
      this.hasSelectHighlight = false;
      return;
    }

    if (this.selectClearInFlight) {
      await this.selectClearInFlight;
      return;
    }

    const clearTask = (async () => {
      await this.settleOrWarn(this.highlighter.clear("select"), 1200, "highlighter.clear(select)", {
        warnOnTimeout: false,
        warnOnReject: false,
      });
      this.hasSelectHighlight = false;
    })();
    this.selectClearInFlight = clearTask.finally(() => {
      this.selectClearInFlight = null;
    });
    await this.selectClearInFlight;
  }

  async frameSelection() {
    if (this.glbSelectedObject) {
      await this.frameGlbObject(this.glbSelectedObject);
      return;
    }
    const raw = useViewerStore.getState().selection;
    const map = rawToModelIdMap(raw);
    if (isEmptyMap(map)) return;
    let fitSettled = false;
    await this.settleOrWarn(
      this.cameraComponent.fitToItems(map).then(() => {
        fitSettled = true;
      }),
      1500,
      "camera.fitToItems",
      { warnOnTimeout: false, warnOnReject: false }
    );
    if (!fitSettled) {
      await this.frameModel();
    }
  }

  private collectMeshesFromObject(root: THREE.Object3D) {
    const meshes: THREE.Mesh[] = [];
    root.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
    return meshes;
  }

  private getCurrentModelMeshes() {
    const meshes: THREE.Mesh[] = [];
    if (this.fragments.list.size > 0) {
      for (const model of this.fragments.list.values()) {
        meshes.push(...this.collectMeshesFromObject(model.object));
      }
      return meshes;
    }
    if (this.glbRoot) {
      meshes.push(...this.collectMeshesFromObject(this.glbRoot));
    }
    return meshes;
  }

  private getCurrentModelBounds() {
    if (this.fragments.list.size > 0) {
      const bounds = new THREE.Box3();
      bounds.makeEmpty();
      for (const model of this.fragments.list.values()) {
        bounds.union(model.box);
      }
      return bounds.isEmpty() ? null : bounds;
    }
    return this.glbBounds ? this.glbBounds.clone() : null;
  }

  private centerCameraTargetToMeshes(meshes: THREE.Mesh[]) {
    if (meshes.length === 0) return;
    const bounds = new THREE.Box3();
    const tmp = new THREE.Box3();
    const center = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const target = new THREE.Vector3();

    bounds.makeEmpty();
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      tmp.setFromObject(mesh);
      bounds.union(tmp);
    }
    if (bounds.isEmpty()) return;

    bounds.getCenter(center);
    const controls = this.cameraComponent.controls;
    controls.getPosition(pos);
    controls.getTarget(target);
    const delta = pos.sub(target);
    const nextPos = center.clone().add(delta);

    void controls.setLookAt(nextPos.x, nextPos.y, nextPos.z, center.x, center.y, center.z, false);
  }

  private async fitMeshesWithFallback(meshes: THREE.Mesh[], padding: number, bounds: THREE.Box3) {
    let fitSettled = false;
    await this.settleOrWarn(
      this.cameraComponent.fit(meshes, padding).then(() => {
        fitSettled = true;
      }),
      1800,
      "camera.fit",
      { warnOnTimeout: false, warnOnReject: false }
    );
    if (fitSettled) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length(), 1) * 1.4;
    const dir = new THREE.Vector3(1, -1, 0.75).normalize();
    const pos = center.clone().addScaledVector(dir, radius);

    await this.settleOrWarn(
      this.cameraComponent.controls.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, false),
      800,
      "camera.fitFallbackLookAt",
      { warnOnTimeout: false, warnOnReject: false }
    );
  }

  async frameModel() {
    const meshes = this.getCurrentModelMeshes();
    if (meshes.length === 0) return;
    const bounds = this.getCurrentModelBounds();
    if (bounds) {
      this.updateCameraBoundsFromBox(bounds, { syncCut: false });
      await this.fitMeshesWithFallback(meshes, 1.15, bounds);
    } else {
      await this.cameraComponent.fit(meshes, 1.15);
    }
    this.centerCameraTargetToMeshes(meshes);
  }

  async setViewMode(mode: "3d" | "2d") {
    const meshes = this.getCurrentModelMeshes();
    if (meshes.length === 0) return;

    if (mode === "3d") {
      await this.cameraComponent.projection.set("Perspective");
      const bounds = this.getCurrentModelBounds();
      if (!bounds) return;
      this.updateCameraBoundsFromBox(bounds, { syncCut: false });
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(size.length(), 1) * 1.25;
      const dir = new THREE.Vector3(1, -1, 0.75).normalize();
      const pos = center.clone().addScaledVector(dir, radius);
      await this.settleOrWarn(
        this.cameraComponent.controls.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, true),
        1200,
        "camera.setLookAt(3d)",
        { warnOnTimeout: false, warnOnReject: false }
      );
      await this.fitMeshesWithFallback(meshes, 1.1, bounds);
      this.noteHistory("tool", "View mode", "3D perspective");
      return;
    }

    await this.setViewPreset("top", { orthographic: true });
    this.noteHistory("tool", "View mode", "2D orthographic");
  }

  async setViewPreset(
    preset: ViewerViewPreset,
    opts?: { orthographic?: boolean }
  ) {
    const meshes = this.getCurrentModelMeshes();
    if (meshes.length === 0) return;

    const bounds = this.getCurrentModelBounds();
    if (!bounds) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length(), 1) * 1.35;

    const directionMap: Record<ViewerViewPreset, THREE.Vector3> = {
      top: new THREE.Vector3(0, 0, 1),
      bottom: new THREE.Vector3(0, 0, -1),
      front: new THREE.Vector3(0, -1, 0),
      left: new THREE.Vector3(-1, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      back: new THREE.Vector3(0, 1, 0),
    };

    const dir = directionMap[preset].clone().normalize();
    const pos = center.clone().addScaledVector(dir, radius);
    const up =
      preset === "top"
        ? new THREE.Vector3(0, 1, 0)
        : preset === "bottom"
          ? new THREE.Vector3(0, -1, 0)
          : new THREE.Vector3(0, 0, 1);

    if (opts?.orthographic) {
      await this.cameraComponent.projection.set("Orthographic");
    }

    this.updateCameraBoundsFromBox(bounds, { syncCut: false });
    this.cameraComponent.three.up.copy(up);
    await this.settleOrWarn(
      this.cameraComponent.controls.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, true),
      1200,
      `camera.setLookAt(${preset})`,
      { warnOnTimeout: false, warnOnReject: false }
    );
    await this.fitMeshesWithFallback(meshes, 1.04, bounds);
    this.noteHistory("tool", "View preset", preset);
  }

  async loadIfcFromUrl(url: string, name: string) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch IFC (${resp.status})`);
    const buffer = await resp.arrayBuffer();
    await this.loadIfcFromBuffer(buffer, name);
  }

  async loadGlbFromUrl(url: string, name: string) {
    const timeoutMs = 300000;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);

    useViewerStore.getState().setLoading({ active: true, label: "Downloading GLB...", progress: 0 });
    useViewerStore.getState().setModelName(name);

    try {
      const resp = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (!resp.ok) throw new Error(`Failed to fetch GLB (${resp.status}) from ${url}`);
      useViewerStore.getState().setLoading({ active: true, label: "Downloading GLB...", progress: 0.35 });
      const buffer = await resp.arrayBuffer();
      useViewerStore.getState().setLoading({ active: true, label: "Parsing GLB...", progress: 0.7 });
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
      useViewerStore.getState().setCoordinates(null);
      useViewerStore.getState().resetPropertyFilter();
      this.cutHidden = emptyModelIdMap();
      this.filteredOut = emptyModelIdMap();

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
      this.classByItemByModel.clear();
      this.itemBoxesByModel.clear();
      this.itemCutSamplesByModel.clear();
      useViewerStore.getState().setClassGroups([]);
      useViewerStore.getState().setStoreyGroups([]);
      this.manualHidden = emptyModelIdMap();
      this.appliedHidden = emptyModelIdMap();
      this.visibilityForceFullApply = true;
      this.isolateActive = false;
      this.hiddenBeforeIsolateRaw = null;

      const loader = new GLTFLoader();
      const parseTimeoutMs = 300000;
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
      this.noteHistory("load", "GLB loaded", `${name} loaded as visual model.`);
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
    useViewerStore.getState().setCoordinates(null);
    useViewerStore.getState().resetPropertyFilter();
    this.cutHidden = emptyModelIdMap();
    this.filteredOut = emptyModelIdMap();

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
    this.classByItemByModel.clear();
    this.itemBoxesByModel.clear();
    this.itemCutSamplesByModel.clear();
    this.manualHidden = emptyModelIdMap();
    this.appliedHidden = emptyModelIdMap();
    this.visibilityForceFullApply = true;
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

    await this.cameraComponent.projection.set("Perspective");
    await this.frameModel();

    // Populate class + storey groups for UI (tree/filters).
    await this.buildGroupsForModel(model);

    // Keep visibility/cut/filter states coherent after loading.
    await this.applyVisibilityFromState();
    await this.applyCutFromState();
    await this.setActiveTool("select");

    // Compare against previous IFC revision snapshot and store current one.
    const currentSnapshot = await this.captureRevisionSnapshot(model, name);
    this.compareRevisionSnapshots(this.previousIfcSnapshot, currentSnapshot);
    this.previousIfcSnapshot = currentSnapshot;

    useViewerStore.getState().setLoading({ active: false, label: "", progress: 1 });
    toast.success("Model loaded", { description: name });
    this.noteHistory("load", "IFC loaded", `${name} loaded successfully.`);
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

    // Section box starts from model bounds.
    this.section.resetBoxToBounds(box);

    // Register materials for clipping and frame quickly so the user can interact immediately.
    this.section.registerMaterialsFrom(root);
    await this.cameraComponent.projection.set("Perspective");
    await this.frameModel();
    this.cameraComponent.enabled = true;

    // NOTE: We intentionally skip GLB BVH building here.
    // If the BVH worker is unavailable, three-mesh-bvh local fallback can block the main thread
    // for large GLBs and freeze interaction right after loading.
    // IFC models still get BVH through the dedicated IFC pipeline.

    await this.settleOrWarn(this.applyCutFromState(), 1500, "applyCutFromState(GLB)", {
      warnOnTimeout: false,
      warnOnReject: false,
    });
    await this.setActiveTool("select");
  }

  private async buildGroupsForModel(model: FRAGS.FragmentsModel) {
    // Classes by IFC category.
    const cats = await model.getItemsOfCategories([/.*/i]);
    const classByItem = new Map<number, string>();
    const classGroups = Object.entries(cats)
      .map(([category, ids]) => ({
        id: category,
        label: friendlyIfcLabel(category),
        count: ids.length,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    for (const [category, ids] of Object.entries(cats)) {
      for (const lid of ids) classByItem.set(lid, category);
      this.classGroupItems.set(category, { [model.modelId]: new Set(ids) });
    }
    this.classByItemByModel.set(model.modelId, classByItem);
    useViewerStore.getState().setClassGroups(classGroups);

    // Cache per-item boxes for cut + shortest-distance measurement.
    const geometryIds = await model.getItemsIdsWithGeometry();
    const geometryBoxes = await model.getBoxes(geometryIds);
    const boxMap = new Map<number, THREE.Box3>();
    const cutSamples: Array<{ localId: number; sampleX: number; sampleZ: number; classId?: string }> = [];
    const tmpCenter = new THREE.Vector3();
    for (let i = 0; i < geometryIds.length; i++) {
      const lid = geometryIds[i];
      const b = geometryBoxes[i];
      if (!b) continue;
      boxMap.set(lid, b.clone());
      b.getCenter(tmpCenter);
      cutSamples.push({
        localId: lid,
        sampleX: tmpCenter.x,
        sampleZ: tmpCenter.z,
        classId: classByItem.get(lid),
      });
    }
    this.itemBoxesByModel.set(model.modelId, boxMap);
    this.itemCutSamplesByModel.set(model.modelId, cutSamples);

    // Storeys by spatial structure (IFCBUILDINGSTOREY).
    const spatial = await model.getSpatialStructure();
    const geomIds = new Set(geometryIds);

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

    // Camera and cut bounds from model bounding box.
    const box = model.box.clone();
    this.updateCameraBoundsFromBox(box);

    // Initialize section box to cover the model (even if disabled by default).
    this.section.resetBoxToBounds(box);
  }

  async hideSelected() {
    if (this.glbSelectedObject) {
      this.glbSelectedObject.visible = false;
      this.setGlbSelectedObject(null, { updateProperties: true, noteHistory: false });
      this.setGlbHoveredObject(null);
      toast("Hidden object", { description: "GLB object hidden." });
      this.noteHistory("visibility", "Hidden GLB object");
      return;
    }

    const raw = useViewerStore.getState().selection;
    const map = rawToModelIdMap(raw);
    if (isEmptyMap(map)) return;

    addToMap(this.manualHidden, map);
    await this.applyVisibilityFromState();
    await this.clearSelection();
    toast("Hidden objects", { description: `Hidden ${countModelIdMap(map)} item(s).` });
    this.noteHistory("visibility", "Hidden elements", `${countModelIdMap(map)} item(s) hidden.`);
  }

  async isolateSelected() {
    if (this.glbSelectedObject && this.glbRoot && !this.hasIfcModels()) {
      if (!this.glbIsolateSnapshot) {
        const snapshot = new Map<THREE.Object3D, boolean>();
        this.glbRoot.traverse((obj: THREE.Object3D) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) snapshot.set(mesh, mesh.visible);
        });
        this.glbIsolateSnapshot = snapshot;

        const keep = new Set<THREE.Object3D>();
        this.glbSelectedObject.traverse((obj: THREE.Object3D) => keep.add(obj));
        this.glbRoot.traverse((obj: THREE.Object3D) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.visible = keep.has(mesh);
        });
        toast("Isolation", { description: "Isolated GLB selection." });
        this.noteHistory("visibility", "GLB isolation enabled");
      } else {
        await this.restoreIsolation();
      }
      return;
    }

    const raw = useViewerStore.getState().selection;
    const map = rawToModelIdMap(raw);
    if (isEmptyMap(map)) return;
    if (!this.hasIfcModels()) return;

    if (!this.isolateActive) {
      this.hiddenBeforeIsolateRaw = await this.hider.getVisibilityMap(false);
      await this.hider.isolate(map);
      this.visibilityForceFullApply = true;
      this.isolateActive = true;
      toast("Isolation", { description: `Isolated ${countModelIdMap(map)} item(s).` });
      this.noteHistory("visibility", "Isolation enabled", `${countModelIdMap(map)} item(s) isolated.`);
    } else {
      await this.restoreIsolation();
    }
  }

  private async restoreIsolation() {
    if (this.glbIsolateSnapshot) {
      for (const [obj, visible] of this.glbIsolateSnapshot) {
        obj.visible = visible;
      }
      this.glbIsolateSnapshot = null;
      toast("Isolation", { description: "Restored GLB visibility." });
      this.noteHistory("visibility", "GLB isolation cleared");
      return;
    }

    this.isolateActive = false;
    this.hiddenBeforeIsolateRaw = null;
    await this.applyVisibilityFromState();
    toast("Isolation", { description: "Restored previous visibility." });
    this.noteHistory("visibility", "Isolation cleared", "Previous visibility restored.");
  }

  async unhideAll() {
    if (this.glbRoot) {
      this.glbRoot.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.visible = true;
      });
      this.glbIsolateSnapshot = null;
    }

    if (this.hasIfcModels()) {
      await this.hider.set(true);
    }
    this.manualHidden = emptyModelIdMap();
    this.appliedHidden = emptyModelIdMap();
    this.visibilityForceFullApply = false;
    this.isolateActive = false;
    this.hiddenBeforeIsolateRaw = null;
    useViewerStore.getState().resetFilters();
    this.cutHidden = emptyModelIdMap();
    this.filteredOut = emptyModelIdMap();
    toast("Visibility", { description: "All objects visible." });
    this.noteHistory("visibility", "Unhide all", "All elements are now visible.");
  }

  async setClassVisible(groupId: string, visible: boolean) {
    useViewerStore.getState().setClassVisibility(groupId, visible);
    await this.applyVisibilityFromState();
    this.noteHistory("visibility", "Class visibility changed", `${groupId}: ${visible ? "shown" : "hidden"}`);
  }

  async setStoreyVisible(groupId: string, visible: boolean) {
    useViewerStore.getState().setStoreyVisibility(groupId, visible);
    await this.applyVisibilityFromState();
    this.noteHistory(
      "visibility",
      "Storey visibility changed",
      `${groupId}: ${visible ? "shown" : "hidden"}`
    );
  }

  private async applyVisibilityFromState() {
    if (this.isolateActive) return;

    const s = useViewerStore.getState();
    const nextHide: ModelIdMap = emptyModelIdMap();

    for (const [id, items] of this.classGroupItems) {
      if (s.classVisibility[id] === false) addToMap(nextHide, items);
    }
    for (const [id, items] of this.storeyGroupItems) {
      if (s.storeyVisibility[id] === false) addToMap(nextHide, items);
    }
    addToMap(nextHide, this.manualHidden);
    addToMap(nextHide, this.cutHidden);
    addToMap(nextHide, this.filteredOut);

    if (!this.hasIfcModels()) {
      this.appliedHidden = cloneModelIdMap(nextHide);
      this.visibilityForceFullApply = false;
      return;
    }

    if (this.visibilityForceFullApply) {
      await this.hider.set(true);
      if (!isEmptyMap(nextHide)) await this.hider.set(false, nextHide);
      this.appliedHidden = cloneModelIdMap(nextHide);
      this.visibilityForceFullApply = false;
      return;
    }

    const toHide = subtractModelIdMap(nextHide, this.appliedHidden);
    const toShow = subtractModelIdMap(this.appliedHidden, nextHide);

    if (!isEmptyMap(toShow)) await this.hider.set(true, toShow);
    if (!isEmptyMap(toHide)) await this.hider.set(false, toHide);
    this.appliedHidden = cloneModelIdMap(nextHide);
  }

  async selectGroup(group: { type: "class" | "storey"; id: string }) {
    this.setGlbSelectedObject(null, { updateProperties: false, noteHistory: false });
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
    this.hasSelectHighlight = true;
    this.refreshSectionMaterialsIfNeeded();
    this.noteHistory("selection", "Group selected", `${group.type} ${group.id}`);
    if (primary) await this.updateProperties(primary);
  }

  private syncMeasurementsFromScene() {
    const next = this.measurements.list().map((m) => {
      const meta = this.measurementMeta.get(m.id);
      return {
        id: m.id,
        kind: "distance" as const,
        mode: meta?.mode ?? "point",
        start: [m.start.x, m.start.y, m.start.z] as [number, number, number],
        end: [m.end.x, m.end.y, m.end.z] as [number, number, number],
        meters: m.meters,
        note: meta?.note,
      };
    });
    useViewerStore.getState().setMeasurements(next);
  }

  addDistanceMeasurement(
    start: THREE.Vector3,
    end: THREE.Vector3,
    mode: Exclude<ViewerMeasurementMode, "coords"> = "point",
    note?: string
  ) {
    const id = this.measurements.add(start, end);
    this.measurementMeta.set(id, { mode, note });
    this.syncMeasurementsFromScene();
    toast("Measurement added", { description: `${start.distanceTo(end).toFixed(3)} m` });
    this.noteHistory("measurement", "Distance measured", `${start.distanceTo(end).toFixed(3)} m (${mode}).`);
    return id;
  }

  async measureShortestDistanceBetween(a: ViewerSelectionKey, b: ViewerSelectionKey) {
    const boxA = this.itemBoxesByModel.get(a.modelId)?.get(a.localId) ?? null;
    const boxB = this.itemBoxesByModel.get(b.modelId)?.get(b.localId) ?? null;
    if (!boxA || !boxB) {
      toast.error("Shortest distance unavailable", {
        description: "Element bounds are missing for one or both selections.",
      });
      return;
    }

    const { pA, pB, distance } = closestPointsBetweenBoxes(boxA, boxB);
    this.addDistanceMeasurement(
      pA,
      pB,
      "shortest",
      `A ${a.localId} -> B ${b.localId} (AABB approximation)`
    );
    toast("Shortest distance", {
      description: `${distance.toFixed(3)} m (bounding-box approximation)`,
    });
  }

  removeMeasurement(id: string) {
    this.measurements.remove(id);
    this.measurementMeta.delete(id);
    useViewerStore.getState().removeMeasurement(id);
  }

  clearMeasurements() {
    this.measurements.clear();
    this.measurementMeta.clear();
    useViewerStore.getState().clearMeasurements();
  }

  setSectionEnabled(enabled: boolean) {
    useViewerStore.getState().setSection({ enabled });
    this.section.setEnabled(enabled);
    this.section.setMode("box");
    if (enabled) this.refreshSectionMaterialsIfNeeded();
    if (!enabled && this.glbRoot && !this.hasIfcModels() && useViewerStore.getState().cut.enabled) {
      this.queueApplyCut();
    }
    this.noteHistory("tool", enabled ? "Section enabled" : "Section disabled");
  }

  setSectionInvert(invert: boolean) {
    useViewerStore.getState().setSection({ invert });
    this.section.setInvert(invert);
  }

  resetSectionBox() {
    const first = [...this.fragments.list.values()][0];
    if (first) {
      this.section.resetBoxToBounds(first.box);
      return;
    }
    if (this.glbBounds) this.section.resetBoxToBounds(this.glbBounds);
  }

  enableSectionEditing(active: boolean) {
    const s = useViewerStore.getState().section;
    if (active && !s.enabled) this.setSectionEnabled(true);
    this.section.setBoxEditing(active);
    this.section.setTransformMode(s.transformMode);
    this.section.setLockRotation(s.lockRotation);
    if (!active) this.cameraComponent.enabled = true;
  }

  setSectionTransformMode(mode: "translate" | "rotate" | "scale") {
    const { lockRotation } = useViewerStore.getState().section;
    const nextMode = lockRotation && mode === "rotate" ? "translate" : mode;
    useViewerStore.getState().setSection({ transformMode: nextMode });
    this.section.setTransformMode(nextMode);
  }

  setSectionLockRotation(locked: boolean) {
    useViewerStore.getState().setSection({ lockRotation: locked });
    this.section.setLockRotation(locked);
    if (locked) {
      this.setSectionTransformMode("translate");
    }
  }

  enableCut(enabled: boolean) {
    useViewerStore.getState().setCut({ enabled });
    this.queueApplyCut();
    this.noteHistory("tool", enabled ? "Cut enabled" : "Cut disabled");
  }

  setCutOrientation(orientation: "horizontal" | "vertical") {
    useViewerStore.getState().setCut({ orientation });
    this.syncCutRangeForOrientation(orientation, { preserveRatio: true });
    if (useViewerStore.getState().activeTool === "cut") this.setCursor(this.getCutCursor(orientation));
    this.queueApplyCut();
  }

  setCutFlip(flip: boolean) {
    useViewerStore.getState().setCut({ flip });
    this.queueApplyCut();
  }

  setCutOffset(offset: number) {
    const cut = useViewerStore.getState().cut;
    const clamped = Math.min(Math.max(offset, cut.min), cut.max);
    useViewerStore.getState().setCut({ offset: clamped });
    this.queueApplyCut();
  }

  setCutIgnoredClass(classId: string, ignored: boolean) {
    useViewerStore.getState().setCutIgnoredClass(classId, ignored);
    this.queueApplyCut();
  }

  private collectFilterValues(
    rawData: unknown,
    psetName: string,
    propName: string
  ) {
    const psetNeedle = psetName.trim().toLowerCase();
    const propNeedle = propName.trim().toLowerCase();
    const out: string[] = [];

    if (!isRecord(rawData)) return out;

    // Top-level attributes fallback.
    for (const [k, v] of Object.entries(rawData)) {
      if (Array.isArray(v)) continue;
      if (isRecord(v) && !("value" in v)) continue;
      if (propNeedle && k.toLowerCase() !== propNeedle) continue;
      const value = toStringValue(v);
      if (value) out.push(value);
    }

    const psets: PropertiesPayload["psets"] = [];
    collectPsetsDeep(rawData, psets);
    for (const pset of psets) {
      if (psetNeedle && !pset.name.toLowerCase().includes(psetNeedle)) continue;
      for (const prop of pset.props) {
        if (propNeedle && !prop.name.toLowerCase().includes(propNeedle)) continue;
        if (prop.value) out.push(prop.value);
      }
    }

    return out;
  }

  async applyPropertyFilterFromState() {
    const filter = useViewerStore.getState().propertyFilter;
    if (!filter.property.trim() || !filter.value.trim()) {
      toast.error("Filter is incomplete", {
        description: "Set at least property name and value.",
      });
      return;
    }

    useViewerStore.getState().setLoading({
      active: true,
      label: "Applying property filter...",
      progress: 0,
    });

    try {
      const matches: ModelIdMap = emptyModelIdMap();
      const nonMatches: ModelIdMap = emptyModelIdMap();
      const modelInfos: Array<{ model: FRAGS.FragmentsModel; ids: number[] }> = [];

      let total = 0;
      for (const model of this.fragments.list.values()) {
        const ids = await model.getItemsIdsWithGeometry();
        if (ids.length === 0) continue;
        modelInfos.push({ model, ids });
        total += ids.length;
      }

      let done = 0;
      const needsDeep = filter.pset.trim().length > 0;

      for (const { model, ids } of modelInfos) {
        const data = await model.getItemsData(ids, { attributesDefault: true });
        const deepData = needsDeep ? new Array<unknown>(ids.length) : null;

        if (needsDeep && deepData) {
          const batchSize = 24;
          for (let start = 0; start < ids.length; start += batchSize) {
            const end = Math.min(start + batchSize, ids.length);
            const batch = await Promise.all(
              ids.slice(start, end).map((lid) => model.getItem(lid).getData())
            );
            for (let i = start; i < end; i++) deepData[i] = batch[i - start];
            if (start > 0 && start % (batchSize * 6) === 0) await this.yieldToMainThread();
          }
        }

        const matched = new Set<number>();
        for (let i = 0; i < ids.length; i++) {
          const lid = ids[i];
          const source = deepData ? deepData[i] : data[i];
          const values = this.collectFilterValues(source, filter.pset, filter.property);
          const ok = values.some((v) => compareByOperator(v, filter.operator, filter.value));
          if (ok) matched.add(lid);

          done += 1;
          if (done % 150 === 0 || done === total) {
            useViewerStore.getState().setLoading({
              active: true,
              label: "Applying property filter...",
              progress: total === 0 ? 1 : done / total,
            });
            await this.yieldToMainThread();
          }
        }

        matches[model.modelId] = matched;
        nonMatches[model.modelId] = new Set(ids.filter((id) => !matched.has(id)));
      }

      // Clear previous colorization first.
      for (const model of this.fragments.list.values()) {
        await model.resetColor(undefined);
      }

      if (filter.mode === "show") {
        this.filteredOut = nonMatches;
        await this.applyVisibilityFromState();
      } else {
        this.filteredOut = emptyModelIdMap();
        await this.applyVisibilityFromState();
        for (const model of this.fragments.list.values()) {
          const ids = matches[model.modelId] ? [...matches[model.modelId]] : [];
          if (ids.length === 0) continue;
          await model.setColor(ids, new THREE.Color("#f97316"));
        }
      }

      const matchCount = countModelIdMap(matches);
      useViewerStore.getState().setPropertyFilter({ active: true });
      this.noteHistory(
        "filter",
        "Property filter applied",
        `${matchCount} match(es) with ${filter.mode === "show" ? "show-only" : "colorize"} mode.`
      );
      toast("Filter applied", { description: `${matchCount} matching element(s).` });
    } finally {
      useViewerStore.getState().setLoading({ active: false, label: "", progress: 1 });
    }
  }

  async clearPropertyFilter() {
    this.filteredOut = emptyModelIdMap();
    useViewerStore.getState().resetPropertyFilter();
    for (const model of this.fragments.list.values()) {
      await model.resetColor(undefined);
    }
    await this.applyVisibilityFromState();
    this.noteHistory("filter", "Property filter cleared");
  }

  exportPropertyFilterJson() {
    const filter = useViewerStore.getState().propertyFilter;
    return JSON.stringify(
      {
        pset: filter.pset,
        property: filter.property,
        operator: filter.operator,
        value: filter.value,
        mode: filter.mode,
      },
      null,
      2
    );
  }

  async importPropertyFilterJson(raw: string) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid filter JSON: ${msg}`);
    }

    if (!isRecord(parsed)) throw new Error("Invalid filter JSON payload.");

    const next: Partial<ViewerPropertyFilterState> = {};
    if (typeof parsed.pset === "string") next.pset = parsed.pset;
    if (typeof parsed.property === "string") next.property = parsed.property;
    if (
      parsed.operator === "contains" ||
      parsed.operator === "equals" ||
      parsed.operator === "not_equals" ||
      parsed.operator === "gt" ||
      parsed.operator === "lt" ||
      parsed.operator === "gte" ||
      parsed.operator === "lte"
    ) {
      next.operator = parsed.operator;
    }
    if (typeof parsed.value === "string") next.value = parsed.value;
    if (parsed.mode === "show" || parsed.mode === "colorize") next.mode = parsed.mode;

    useViewerStore.getState().setPropertyFilter(next);
    this.noteHistory("filter", "Property filter imported");
  }

  private applyGlbCutFromState() {
    const state = useViewerStore.getState();
    const cut = state.cut;
    const section = state.section;

    if (!this.glbRoot) return;

    // Section box has priority over single-plane cut when both are toggled.
    if (section.enabled) {
      this.section.setMode("box");
      this.section.setInvert(section.invert);
      this.section.setEnabled(true);
      return;
    }

    if (!cut.enabled) {
      this.section.setEnabled(false);
      return;
    }

    this.section.setMode("plane");
    this.section.setPlaneAxis(cut.orientation === "horizontal" ? "z" : "x");
    this.section.setPlaneOffset(cut.offset);
    this.section.setInvert(cut.flip);
    this.section.setEnabled(true);
  }

  private async applyCutFromState() {
    const cut = useViewerStore.getState().cut;
    if (!this.hasIfcModels() && this.glbRoot) {
      this.cutHidden = emptyModelIdMap();
      this.applyGlbCutFromState();
      return;
    }

    if (!cut.enabled) {
      this.cutHidden = emptyModelIdMap();
      await this.applyVisibilityFromState();
      return;
    }

    const hidden: ModelIdMap = emptyModelIdMap();
    const ignored = new Set(cut.ignoredClasses);
    let processedInSlice = 0;
    let sliceStart = performance.now();

    for (const [modelId, samples] of this.itemCutSamplesByModel) {
      let target = hidden[modelId];
      if (!target) {
        target = new Set<number>();
        hidden[modelId] = target;
      }

      for (const sample of samples) {
        const classId = sample.classId;
        if (classId && ignored.has(classId)) continue;

        const axisValue = cut.orientation === "horizontal" ? sample.sampleZ : sample.sampleX;
        const shouldHide = cut.flip ? axisValue > cut.offset : axisValue < cut.offset;
        if (shouldHide) target.add(sample.localId);

        processedInSlice += 1;
        if (processedInSlice >= 1400) {
          if (performance.now() - sliceStart > 10) {
            await this.yieldToMainThread();
            sliceStart = performance.now();
          }
          processedInSlice = 0;
        }
      }

      if (target.size === 0) {
        delete hidden[modelId];
      }
    }

    this.cutHidden = hidden;
    await this.applyVisibilityFromState();
  }

  private async captureRevisionSnapshot(
    model: FRAGS.FragmentsModel,
    modelName: string
  ): Promise<Map<string, { name: string; tag: string; category: string; modelName: string }>> {
    const out = new Map<string, { name: string; tag: string; category: string; modelName: string }>();
    const ids = await model.getItemsIdsWithGeometry();
    if (ids.length === 0) return out;

    const [guids, data] = await Promise.all([
      model.getGuidsByLocalIds(ids),
      model.getItemsData(ids, { attributesDefault: true }),
    ]);

    for (let i = 0; i < ids.length; i++) {
      const guid = guids[i];
      if (!guid) continue;
      const d = data[i];
      out.set(guid, {
        name: getAttr(d, "Name") ?? "",
        tag: getAttr(d, "Tag") ?? "",
        category: getAttr(d, "ObjectType") ?? "",
        modelName,
      });
    }
    return out;
  }

  private compareRevisionSnapshots(
    prev: Map<string, { name: string; tag: string; category: string; modelName: string }> | null,
    curr: Map<string, { name: string; tag: string; category: string; modelName: string }>
  ) {
    if (!prev) {
      this.noteHistory("revision", "Revision baseline created", `${curr.size} GUID(s) captured.`);
      return;
    }

    let unchanged = 0;
    let changed = 0;
    let added = 0;
    let removed = 0;
    const changedGuids: string[] = [];

    for (const [guid, now] of curr) {
      const old = prev.get(guid);
      if (!old) {
        added += 1;
        continue;
      }
      const same = old.name === now.name && old.tag === now.tag && old.category === now.category;
      if (same) unchanged += 1;
      else {
        changed += 1;
        if (changedGuids.length < 25) changedGuids.push(guid);
      }
    }

    for (const guid of prev.keys()) {
      if (!curr.has(guid)) removed += 1;
    }

    const summary = `unchanged ${unchanged}, changed ${changed}, added ${added}, removed ${removed}`;
    this.noteHistory("revision", "Revision compared", summary);
    if (changedGuids.length > 0) {
      this.noteHistory("revision", "Changed GUID sample", changedGuids.join(", "));
    }
    toast("Revision comparison", { description: summary });
  }

  getNavigationHints() {
    return "L-click select, R-drag orbit, M-drag pan, Wheel zoom";
  }

  async reset() {
    await this.setActiveTool("select");
    if (this.hasIfcModels()) {
      await this.hider.set(true);
    }
    this.manualHidden = emptyModelIdMap();
    this.appliedHidden = emptyModelIdMap();
    this.visibilityForceFullApply = false;
    this.cutHidden = emptyModelIdMap();
    this.filteredOut = emptyModelIdMap();
    this.isolateActive = false;
    this.hiddenBeforeIsolateRaw = null;
    useViewerStore.getState().resetFilters();
    useViewerStore.getState().resetPropertyFilter();
    useViewerStore.getState().setCoordinates(null);
    useViewerStore.getState().setCut({
      enabled: false,
      flip: false,
      ignoredClasses: [],
    });
    for (const model of this.fragments.list.values()) {
      await model.resetColor(undefined);
    }

    this.setSectionInvert(false);
    this.setSectionEnabled(false);
    this.setSectionLockRotation(false);
    this.setSectionTransformMode("translate");
    this.section.setBoxEditing(false);
    this.resetSectionBox();

    this.clearMeasurements();
    await this.cameraComponent.projection.set("Perspective");
    await this.clearSelection();
    await this.clearHover();
    await this.frameModel();

    toast("Reset", { description: "Viewer state reset." });
    this.noteHistory("tool", "Viewer reset", "Tools, visibility, section, cut and filters reset.");
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
    useViewerStore.getState().setRightPanelTab("properties");
    this.noteHistory(
      "properties",
      "Properties inspected",
      `${guid ?? `Local ${key.localId}`} (${category ?? "Unknown class"})`
    );
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
