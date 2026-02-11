"use client";

import { Badge } from "../ui/badge";
import { useViewerStore } from "../../lib/viewer/viewerStore";

export function StatusBar() {
  const stats = useViewerStore((s) => s.stats);
  const loading = useViewerStore((s) => s.loading);
  const props = useViewerStore((s) => s.properties);
  const selection = useViewerStore((s) => s.selection);

  const selectedCount = Object.values(selection).reduce((acc, arr) => acc + arr.length, 0);

  return (
    <div className="flex h-[30px] items-center justify-between border-t border-slate-200 bg-white/75 px-3 text-xs text-slate-600 backdrop-blur">
      <div className="flex items-center gap-2">
        <Badge variant="muted">FPS: {stats.fps}</Badge>
        <Badge variant="muted">Tris: {stats.triangles.toLocaleString()}</Badge>
        <Badge variant="muted">Selected: {selectedCount}</Badge>
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="default">GUID: {props?.guid ?? "-"}</Badge>
        {loading.active ? (
          <Badge variant="accent">
            {loading.label || "Loading"} {Math.round((loading.progress || 0) * 100)}%
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

