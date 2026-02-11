"use client";

import * as React from "react";
import {
  Box,
  EyeOff,
  Focus,
  MousePointer2,
  Ruler,
  RotateCcw,
  Undo2,
} from "lucide-react";

import { useViewer } from "../viewer/ViewerProvider";
import { useViewerStore } from "../../lib/viewer/viewerStore";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";

export function LeftToolbar() {
  const { viewer } = useViewer();
  const activeTool = useViewerStore((s) => s.activeTool);

  const setTool = async (tool: "select" | "measure" | "section") => {
    if (!viewer) return;
    await viewer.setActiveTool(tool);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2">
        <div className="pointer-events-auto w-[46px] rounded-2xl border border-slate-200 bg-white/85 p-2 shadow-panel backdrop-blur">
          <ToolButton
            active={activeTool === "select"}
            icon={<MousePointer2 className="h-4 w-4" />}
            label="Select (Esc)"
            onClick={() => setTool("select")}
          />
          <ToolButton
            active={activeTool === "measure"}
            icon={<Ruler className="h-4 w-4" />}
            label="Measure"
            onClick={() => setTool("measure")}
          />
          <ToolButton
            active={activeTool === "section"}
            icon={<Box className="h-4 w-4" />}
            label="Section Box"
            onClick={() => setTool("section")}
          />

          <div className="my-2 h-px bg-slate-200" />

          <ToolButton
            active={false}
            icon={<EyeOff className="h-4 w-4" />}
            label="Hide selected (H)"
            onClick={() => viewer?.hideSelected()}
          />
          <ToolButton
            active={false}
            icon={<Focus className="h-4 w-4" />}
            label="Isolate (Shift+H)"
            onClick={() => viewer?.isolateSelected()}
          />
          <ToolButton
            active={false}
            icon={<Undo2 className="h-4 w-4" />}
            label="Unhide all (Alt+H)"
            onClick={() => viewer?.unhideAll()}
          />
          <ToolButton
            active={false}
            icon={<RotateCcw className="h-4 w-4" />}
            label="Reset viewer"
            onClick={() => viewer?.reset()}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

function ToolButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 rounded-xl text-slate-700 hover:bg-slate-100",
            active && "bg-slate-900 text-white hover:bg-slate-900"
          )}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
