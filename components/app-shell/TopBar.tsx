"use client";

import * as React from "react";
import { FolderOpen, RotateCcw, Upload } from "lucide-react";
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
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const typeLabel = ext === "glb" ? "GLB" : ext === "ifc" ? "IFC" : "model";
    await runSafe(`Failed to load ${typeLabel}`, async () => {
      const buffer = await file.arrayBuffer();
      if (ext === "ifc") {
        await viewer.loadIfcFromBuffer(buffer, file.name);
        return;
      }
      if (ext === "glb") {
        await viewer.loadGlbFromBuffer(buffer, file.name);
        return;
      }
      throw new Error("Unsupported file. Please choose an .ifc or .glb file.");
    });
  };

  const loadSampleIfc = async () => {
    if (!viewer) return;
    await loadFromCandidates(["/models/sample.ifc", "/sample.ifc"], async (url) => {
      await viewer.loadIfcFromUrl(url, "sample.ifc");
    });
  };

  const loadSampleGlb = async () => {
    if (!viewer) return;
    await loadFromCandidates(["/house.glb", "/models/house.glb", "/models/sample.glb"], async (url) => {
      await viewer.loadGlbFromUrl(url, url.split("/").pop() ?? "sample.glb");
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
            BALUX BIM Viewer
          </div>
          <div className="text-xs text-slate-500">
            {modelName ? `Model: ${modelName}` : "No model loaded"}
          </div>
        </div>

        <Tabs value={topTab} onValueChange={(v) => setTopTab(v as ViewerTopTab)}>
          <TabsList className="bg-slate-100">
            <TabsTrigger value="viewer">BIM Viewer</TabsTrigger>
            <TabsTrigger value="info">Informationsstyring</TabsTrigger>
            <TabsTrigger value="site">Byggepladsledelse</TabsTrigger>
            <TabsTrigger value="fm">Facility Management</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <TooltipProvider delayDuration={250}>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".ifc,.glb"
            className="hidden"
            onChange={onFileSelected}
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runSafe("Failed to load sample IFC", loadSampleIfc)}
                disabled={!viewer}
              >
                <Upload className="h-4 w-4" />
                Load sample IFC
              </Button>
            </TooltipTrigger>
            <TooltipContent>Loads `/public/models/sample.ifc`</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void runSafe("Failed to load sample GLB", loadSampleGlb)}
                disabled={!viewer}
              >
                <Upload className="h-4 w-4" />
                Load sample GLB
              </Button>
            </TooltipTrigger>
            <TooltipContent>Loads `/public/house.glb`</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onPickFile} disabled={!viewer}>
                <FolderOpen className="h-4 w-4" />
                Open IFC/GLB...
              </Button>
            </TooltipTrigger>
            <TooltipContent>Load a local `.ifc` or `.glb` file</TooltipContent>
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
                Reset View
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset view, tools, section, cut, filters</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

