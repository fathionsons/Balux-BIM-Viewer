"use client";

import * as React from "react";

import type { ViewerApp } from "../../lib/viewer/ViewerApp";

type ViewerContextValue = {
  viewer: ViewerApp | null;
  setViewer: (viewer: ViewerApp | null) => void;
};

const ViewerContext = React.createContext<ViewerContextValue | null>(null);

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = React.useState<ViewerApp | null>(null);
  const value = React.useMemo(() => ({ viewer, setViewer }), [viewer]);
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  const ctx = React.useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used within <ViewerProvider>.");
  return ctx;
}

