import { create } from "zustand";

export type ViewerTopTab = "viewer" | "info" | "site" | "fm";

export type ViewerToolId = "select" | "measure" | "section";

export type RawModelIdMap = Record<string, number[]>;

export type ViewerSelectionKey = { modelId: string; localId: number };

export type PropertiesPayload = {
  modelId: string;
  localId: number;
  guid: string | null;
  category: string | null;
  name: string | null;
  tag: string | null;
  /** A structured, UI-ready slice of item data (psets + attributes) */
  psets: Array<{
    name: string;
    props: Array<{ name: string; value: string }>;
  }>;
  /** Raw attributes (simple key/value) for quick debug */
  attributes: Array<{ name: string; value: string }>;
};

export type ViewerStats = {
  fps: number;
  triangles: number;
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

export type ViewerMeasurement = {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  meters: number;
};

export type ViewerSectionState = {
  enabled: boolean;
  mode: "box" | "plane";
  invert: boolean;
  plane: {
    axis: "x" | "y" | "z";
    offset: number;
    min: number;
    max: number;
  };
};

export type ViewerStore = {
  topTab: ViewerTopTab;
  setTopTab: (tab: ViewerTopTab) => void;

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

  measurements: ViewerMeasurement[];
  setMeasurements: (items: ViewerMeasurement[]) => void;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;

  section: ViewerSectionState;
  setSection: (next: Partial<ViewerSectionState>) => void;
  setSectionPlane: (next: Partial<ViewerSectionState["plane"]>) => void;
};

export const useViewerStore = create<ViewerStore>((set, get) => ({
  topTab: "viewer",
  setTopTab: (tab) => set({ topTab: tab }),

  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),

  loading: { active: false, label: "", progress: 0 },
  setLoading: (state) =>
    set((s) => ({
      loading: { ...s.loading, ...state },
    })),

  stats: { fps: 0, triangles: 0 },
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
      classVisibility: groups.reduce<Record<string, boolean>>((acc, g) => {
        acc[g.id] = true;
        return acc;
      }, {}),
    }),
  setStoreyGroups: (groups) =>
    set({
      storeyGroups: groups,
      storeyVisibility: groups.reduce<Record<string, boolean>>((acc, g) => {
        acc[g.id] = true;
        return acc;
      }, {}),
    }),
  setClassVisibility: (id, visible) =>
    set((s) => ({ classVisibility: { ...s.classVisibility, [id]: visible } })),
  setStoreyVisibility: (id, visible) =>
    set((s) => ({ storeyVisibility: { ...s.storeyVisibility, [id]: visible } })),
  resetFilters: () => {
    const { classGroups, storeyGroups } = get();
    set({
      classVisibility: classGroups.reduce<Record<string, boolean>>((acc, g) => {
        acc[g.id] = true;
        return acc;
      }, {}),
      storeyVisibility: storeyGroups.reduce<Record<string, boolean>>((acc, g) => {
        acc[g.id] = true;
        return acc;
      }, {}),
    });
  },

  measurements: [],
  setMeasurements: (items) => set({ measurements: items }),
  removeMeasurement: (id) =>
    set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
  clearMeasurements: () => set({ measurements: [] }),

  section: {
    enabled: false,
    mode: "box",
    invert: false,
    plane: { axis: "z", offset: 0, min: -1, max: 1 },
  },
  setSection: (next) => set((s) => ({ section: { ...s.section, ...next } })),
  setSectionPlane: (next) =>
    set((s) => ({
      section: { ...s.section, plane: { ...s.section.plane, ...next } },
    })),
}));

