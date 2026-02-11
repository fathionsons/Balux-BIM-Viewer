import { create } from "zustand";

export type ViewerTopTab = "viewer" | "info" | "site" | "fm";

export type ViewerToolId = "select" | "measure" | "cut" | "section" | "transform";

export type ViewerRightPanelTab = "properties" | "filters" | "history";

export type RawModelIdMap = Record<string, number[]>;

export type ViewerSelectionKey = { modelId: string; localId: number };

export type PropertiesPayload = {
  modelId: string;
  localId: number;
  guid: string | null;
  category: string | null;
  name: string | null;
  tag: string | null;
  psets: Array<{
    name: string;
    props: Array<{ name: string; value: string }>;
  }>;
  attributes: Array<{ name: string; value: string }>;
};

export type ViewerStats = {
  fps: number;
  triangles: number;
  drawCalls: number;
};

export type ViewerLoadingState = {
  active: boolean;
  label: string;
  progress: number; // 0..1
};

export type ViewerClassGroup = {
  id: string;
  label: string;
  count: number;
};

export type ViewerStoreyGroup = {
  id: string;
  label: string;
  count: number;
};

export type ViewerMeasurementMode = "point" | "laser" | "shortest" | "coords";

export type ViewerMeasurement = {
  id: string;
  kind: "distance";
  mode: Exclude<ViewerMeasurementMode, "coords">;
  start: [number, number, number];
  end: [number, number, number];
  meters: number;
  note?: string;
};

export type ViewerSectionState = {
  enabled: boolean;
  invert: boolean;
  transformMode: "translate" | "rotate" | "scale";
  lockRotation: boolean;
  showGizmo: boolean;
};

export type ViewerCutState = {
  enabled: boolean;
  orientation: "horizontal" | "vertical";
  axis: "x" | "y" | "z";
  flip: boolean;
  offset: number;
  min: number;
  max: number;
  ignoredClasses: string[];
};

export type ViewerTransformState = {
  mode: "translate" | "rotate";
  gizmoVisible: boolean;
};

export type ViewerFilterOperator =
  | "contains"
  | "equals"
  | "not_equals"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export type ViewerPropertyFilterState = {
  pset: string;
  property: string;
  operator: ViewerFilterOperator;
  value: string;
  mode: "show" | "colorize";
  active: boolean;
};

export type ViewerHistoryEvent = {
  id: string;
  ts: number;
  type:
    | "selection"
    | "visibility"
    | "properties"
    | "measurement"
    | "filter"
    | "revision"
    | "tool"
    | "load";
  title: string;
  details?: string;
};

export type ViewerStore = {
  topTab: ViewerTopTab;
  setTopTab: (tab: ViewerTopTab) => void;

  rightPanelTab: ViewerRightPanelTab;
  setRightPanelTab: (tab: ViewerRightPanelTab) => void;

  isTouchDevice: boolean;
  setIsTouchDevice: (value: boolean) => void;

  activeTool: ViewerToolId;
  setActiveTool: (tool: ViewerToolId) => void;

  loading: ViewerLoadingState;
  setLoading: (state: Partial<ViewerLoadingState>) => void;

  stats: ViewerStats;
  setStats: (stats: Partial<ViewerStats>) => void;

  modelName: string | null;
  setModelName: (name: string | null) => void;

  selection: RawModelIdMap;
  primarySelection: ViewerSelectionKey | null;
  hovered: ViewerSelectionKey | null;
  setSelection: (selection: RawModelIdMap, primary: ViewerSelectionKey | null) => void;
  setHovered: (hovered: ViewerSelectionKey | null) => void;

  properties: PropertiesPayload | null;
  setProperties: (payload: PropertiesPayload | null) => void;

  classGroups: ViewerClassGroup[];
  storeyGroups: ViewerStoreyGroup[];
  classVisibility: Record<string, boolean>;
  storeyVisibility: Record<string, boolean>;
  setClassGroups: (groups: ViewerClassGroup[]) => void;
  setStoreyGroups: (groups: ViewerStoreyGroup[]) => void;
  setClassVisibility: (id: string, visible: boolean) => void;
  setStoreyVisibility: (id: string, visible: boolean) => void;
  resetFilters: () => void;

  measurementMode: ViewerMeasurementMode;
  setMeasurementMode: (mode: ViewerMeasurementMode) => void;
  measurements: ViewerMeasurement[];
  setMeasurements: (items: ViewerMeasurement[]) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  coordinates: { x: number; y: number; z: number } | null;
  setCoordinates: (coords: { x: number; y: number; z: number } | null) => void;

  section: ViewerSectionState;
  setSection: (next: Partial<ViewerSectionState>) => void;

  cut: ViewerCutState;
  setCut: (next: Partial<ViewerCutState>) => void;
  setCutIgnoredClass: (classId: string, ignored: boolean) => void;

  transform: ViewerTransformState;
  setTransform: (next: Partial<ViewerTransformState>) => void;

  propertyFilter: ViewerPropertyFilterState;
  setPropertyFilter: (next: Partial<ViewerPropertyFilterState>) => void;
  resetPropertyFilter: () => void;

  history: ViewerHistoryEvent[];
  pushHistory: (event: Omit<ViewerHistoryEvent, "id" | "ts">) => void;
  clearHistory: () => void;
};

function buildVisibilityMap<T extends { id: string }>(groups: T[]) {
  return groups.reduce<Record<string, boolean>>((acc, g) => {
    acc[g.id] = true;
    return acc;
  }, {});
}

export const useViewerStore = create<ViewerStore>((set, get) => ({
  topTab: "viewer",
  setTopTab: (tab) => set({ topTab: tab }),

  rightPanelTab: "properties",
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  isTouchDevice: false,
  setIsTouchDevice: (value) => set({ isTouchDevice: value }),

  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),

  loading: { active: false, label: "", progress: 0 },
  setLoading: (state) =>
    set((s) => ({
      loading: { ...s.loading, ...state },
    })),

  stats: { fps: 0, triangles: 0, drawCalls: 0 },
  setStats: (stats) => set((s) => ({ stats: { ...s.stats, ...stats } })),

  modelName: null,
  setModelName: (name) => set({ modelName: name }),

  selection: {},
  primarySelection: null,
  hovered: null,
  setSelection: (selection, primary) =>
    set({
      selection,
      primarySelection: primary,
    }),
  setHovered: (hovered) => set({ hovered }),

  properties: null,
  setProperties: (payload) => set({ properties: payload }),

  classGroups: [],
  storeyGroups: [],
  classVisibility: {},
  storeyVisibility: {},
  setClassGroups: (groups) =>
    set({
      classGroups: groups,
      classVisibility: buildVisibilityMap(groups),
    }),
  setStoreyGroups: (groups) =>
    set({
      storeyGroups: groups,
      storeyVisibility: buildVisibilityMap(groups),
    }),
  setClassVisibility: (id, visible) =>
    set((s) => ({ classVisibility: { ...s.classVisibility, [id]: visible } })),
  setStoreyVisibility: (id, visible) =>
    set((s) => ({ storeyVisibility: { ...s.storeyVisibility, [id]: visible } })),
  resetFilters: () => {
    const { classGroups, storeyGroups } = get();
    set({
      classVisibility: buildVisibilityMap(classGroups),
      storeyVisibility: buildVisibilityMap(storeyGroups),
    });
  },

  measurementMode: "point",
  setMeasurementMode: (mode) => set({ measurementMode: mode }),
  measurements: [],
  setMeasurements: (items) => set({ measurements: items }),
  removeMeasurement: (id) =>
    set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
  clearMeasurements: () => set({ measurements: [] }),
  coordinates: null,
  setCoordinates: (coords) => set({ coordinates: coords }),

  section: {
    enabled: false,
    invert: false,
    transformMode: "translate",
    lockRotation: false,
    showGizmo: true,
  },
  setSection: (next) => set((s) => ({ section: { ...s.section, ...next } })),

  cut: {
    enabled: false,
    orientation: "horizontal",
    axis: "z",
    flip: false,
    offset: 0,
    min: -1,
    max: 1,
    ignoredClasses: [],
  },
  setCut: (next) => set((s) => ({ cut: { ...s.cut, ...next } })),
  setCutIgnoredClass: (classId, ignored) =>
    set((s) => {
      const list = new Set(s.cut.ignoredClasses);
      if (ignored) list.add(classId);
      else list.delete(classId);
      return { cut: { ...s.cut, ignoredClasses: [...list].sort() } };
    }),

  transform: {
    mode: "rotate",
    gizmoVisible: true,
  },
  setTransform: (next) => set((s) => ({ transform: { ...s.transform, ...next } })),

  propertyFilter: {
    pset: "",
    property: "",
    operator: "contains",
    value: "",
    mode: "show",
    active: false,
  },
  setPropertyFilter: (next) =>
    set((s) => ({ propertyFilter: { ...s.propertyFilter, ...next } })),
  resetPropertyFilter: () =>
    set({
      propertyFilter: {
        pset: "",
        property: "",
        operator: "contains",
        value: "",
        mode: "show",
        active: false,
      },
    }),

  history: [],
  pushHistory: (event) =>
    set((s) => ({
      history: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          ts: Date.now(),
          ...event,
        },
        ...s.history,
      ].slice(0, 500),
    })),
  clearHistory: () => set({ history: [] }),
}));

