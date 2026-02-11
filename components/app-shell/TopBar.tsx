"use client";

import * as React from "react";
import { FolderOpen, Home, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";

import { useViewer } from "../viewer/ViewerProvider";
import { useViewerStore } from "../../lib/viewer/viewerStore";
import type { ViewerTopTab } from "../../lib/viewer/viewerStore";
import { Button } from "../ui/button";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export function TopBar() {
  const { viewer } = useViewer();
  const topTab = useViewerStore((s) => s.topTab);
  const setTopTab = useViewerStore((s) => s.setTopTab);
  const modelName = useViewerStore((s) => s.modelName);

  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const toErrorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

  const runSafe = async (title: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      const message = toErrorMessage(err);
      console.error(`[TopBar] ${title}`, err);
      toast.error(title, { description: message });
    }
  };

  const loadFromCandidates = async (
    candidates: string[],
    loader: (url: string) => Promise<void>
  ) => {
    const errors: string[] = [];
    for (const url of candidates) {
      try {
        await loader(url);
        return;
      } catch (err) {
        errors.push(`${url}: ${toErrorMessage(err)}`);
      }
    }
    throw new Error(`Model could not be loaded. Tried: ${errors.join(" | ")}`);
  };

  const onPickFile = () => fileRef.current?.click();

  const onFileSelected = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !viewer) return;
    await runSafe("Failed to load IFC", async () => {
      const buffer = await file.arrayBuffer();
      await viewer.loadIfcFromBuffer(buffer, file.name);
    });
  };

  const loadSample = async () => {
    if (!viewer) return;
    await loadFromCandidates(["/sample.ifc", "/models/sample.ifc"], async (url) => {
      await viewer.loadIfcFromUrl(url, "sample.ifc");
    });
  };

  const loadHouseGlb = async () => {
    if (!viewer) return;
    await loadFromCandidates(["/house.glb", "/models/house.glb"], async (url) => {
      await viewer.loadGlbFromUrl(url, "house.glb");
    });
  };

  const reset = async () => {
    if (!viewer) return;
    await viewer.reset();
  };

  return (
    <div className="flex h-[52px] items-center justify-between border-b border-slate-200 bg-white/75 px-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold tracking-tight text-slate-900">
            BALUX — BIM Viewer (Web) by Fathi
          </div>
          <div className="text-xs text-slate-500">
            {modelName ? `Model: ${modelName}` : "No model loaded"}
          </div>
        </div>

        <Tabs value={topTab} onValueChange={(v) => setTopTab(v as ViewerTopTab)}>
          <TabsList className="bg-slate-100">
            <TabsTrigger value="viewer">BIM Viewer</TabsTrigger>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="site">Site</TabsTrigger>
            <TabsTrigger value="fm">FM</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <TooltipProvider delayDuration={250}>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".ifc"
            className="hidden"
            onChange={onFileSelected}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runSafe("Failed to load sample IFC", loadSample)}
                disabled={!viewer}
              >
                <Upload className="h-4 w-4" />
                Load sample
              </Button>
            </TooltipTrigger>
            <TooltipContent>Load `/public/sample.ifc` (fallback: `/public/models/sample.ifc`)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runSafe("Failed to load house GLB", loadHouseGlb)}
                disabled={!viewer}
              >
                <Home className="h-4 w-4" />
                Load house visual (GLB)
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Visual-only model: no BIM properties/tree/filters. Source: `/public/house.glb`
              (fallback: `/public/models/house.glb`)
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onPickFile} disabled={!viewer}>
                <FolderOpen className="h-4 w-4" />
                Open IFC...
              </Button>
            </TooltipTrigger>
            <TooltipContent>Load a local IFC file</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runSafe("Reset failed", reset)}
                disabled={!viewer}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset view, tools, section, filters</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
