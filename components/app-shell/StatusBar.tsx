"use client";

import { Badge } from "../ui/badge";
import { useViewerStore } from "../../lib/viewer/viewerStore";

export function StatusBar() {
  const stats = useViewerStore((s) => s.stats);
  const loading = useViewerStore((s) => s.loading);
  const props = useViewerStore((s) => s.properties);
  const coords = useViewerStore((s) => s.coordinates);
  const activeTool = useViewerStore((s) => s.activeTool);
  const selection = useViewerStore((s) => s.selection);
  const cut = useViewerStore((s) => s.cut);
  const selectedCount = Object.values(selection).reduce((acc, ids) => acc + ids.length, 0);

  return (
    <div className="flex h-[30px] items-center justify-between border-t border-slate-200 bg-white/75 px-3 text-xs text-slate-600 backdrop-blur">
      <div className="flex items-center gap-2">
        <Badge variant="muted">FPS: {stats.fps}</Badge>
        <Badge variant="muted">Triangles: {stats.triangles.toLocaleString()}</Badge>
        <Badge variant="muted">Draw calls: {stats.drawCalls.toLocaleString()}</Badge>
        <Badge variant="muted">Tool: {activeTool}</Badge>
        <Badge variant="muted">Selected: {selectedCount}</Badge>
        {activeTool === "cut" && cut.enabled ? (
          <Badge variant="muted">
            Cut: {cut.orientation} {cut.offset.toFixed(2)}m
          </Badge>
        ) : null}
        {coords ? (
          <Badge variant="muted">
            XYZ: {coords.x.toFixed(2)}, {coords.y.toFixed(2)}, {coords.z.toFixed(2)}
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="default">GUID: {props?.guid ?? "-"}</Badge>
        <Badge variant={loading.active ? "accent" : "muted"}>
          Load: {Math.round((loading.progress || 0) * 100)}%
        </Badge>
      </div>
    </div>
  );
}

