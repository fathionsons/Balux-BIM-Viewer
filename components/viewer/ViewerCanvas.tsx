"use client";

import * as React from "react";
import { toast } from "sonner";

import { ViewerApp } from "../../lib/viewer/ViewerApp";
import { useViewerStore } from "../../lib/viewer/viewerStore";
import { useViewer } from "./ViewerProvider";

export function ViewerCanvas() {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { viewer, setViewer } = useViewer();
  const loading = useViewerStore((s) => s.loading);
  const [initError, setInitError] = React.useState<string | null>(null);

  const hasModernViewerApi = React.useCallback((app: ViewerApp | null) => {
    if (!app) return false;
    const anyApp = app as unknown as Record<string, unknown>;
    return typeof anyApp.setViewMode === "function" && typeof anyApp.setViewPreset === "function";
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    let app: ViewerApp | null = null;

    const el = containerRef.current;
    if (!el) return;

    void (async () => {
      try {
        setInitError(null);
        app = await ViewerApp.create(el);
        if (cancelled) {
          app.dispose();
          return;
        }
        setViewer(app);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(e);
        useViewerStore.getState().setLoading({ active: false, label: "", progress: 0 });
        setInitError(message);
        toast.error("Viewer initialization failed", { description: message });
      }
    })();

    return () => {
      cancelled = true;
      setViewer(null);
      app?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!viewer) return;
    if (hasModernViewerApi(viewer)) return;

    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    void (async () => {
      try {
        console.warn("[ViewerCanvas] Stale viewer API detected. Recreating viewer instance.");
        setInitError(null);
        useViewerStore.getState().setLoading({
          active: true,
          label: "Refreshing viewer runtime...",
          progress: 0.15,
        });
        viewer.dispose();
        setViewer(null);
        const fresh = await ViewerApp.create(el);
        if (cancelled) {
          fresh.dispose();
          return;
        }
        setViewer(fresh);
        useViewerStore.getState().setLoading({ active: false, label: "", progress: 1 });
        toast("Viewer refreshed", { description: "Runtime API synchronized." });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(e);
        useViewerStore.getState().setLoading({ active: false, label: "", progress: 0 });
        setInitError(message);
        toast.error("Viewer refresh failed", { description: message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewer, setViewer, hasModernViewerApi]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {loading.active ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/55 backdrop-blur-sm">
          <div className="w-[320px] rounded-xl border border-slate-200 bg-white/95 p-4 shadow-panel">
            <div className="text-sm font-medium text-slate-900">
              {loading.label || "Loading..."}
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round((loading.progress || 0) * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-600">
              {Math.round((loading.progress || 0) * 100)}%
            </div>
            {!viewer ? (
              <div className="mt-2 text-xs text-slate-500">
                Initializing viewer...
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!viewer && initError ? (
        <div className="absolute bottom-3 left-3 max-w-[520px] rounded-lg border border-red-300 bg-red-50/95 p-3 text-xs text-red-900 shadow-panel">
          <div className="font-semibold">Viewer failed to initialize</div>
          <div className="mt-1 break-words">{initError}</div>
        </div>
      ) : null}
    </div>
  );
}
