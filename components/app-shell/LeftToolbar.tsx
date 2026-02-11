"use client";

import * as React from "react";
import {
  Box,
  EyeOff,
  Focus,
  MousePointer2,
  Palette,
  Ruler,
  RotateCcw,
  Slice,
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
  const setRightPanelTab = useViewerStore((s) => s.setRightPanelTab);
  const isTouchDevice = useViewerStore((s) => s.isTouchDevice);

  const setTool = async (tool: "select" | "measure" | "cut" | "section") => {
    if (!viewer) return;
    await viewer.setActiveTool(tool);
  };

  const advancedMsg = "Advanced tools available on desktop";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col gap-2">
        <div className="pointer-events-auto w-[46px] rounded-2xl border border-slate-200 bg-white/85 p-2 shadow-panel backdrop-blur">
          <ToolButton
            active={activeTool === "select"}
            icon={<MousePointer2 className="h-4 w-4" />}
            label="Select (Q)"
            onClick={() => setTool("select")}
          />
          <ToolButton
            active={activeTool === "measure"}
            icon={<Ruler className="h-4 w-4" />}
            label="Measure 3D (M)"
            onClick={() => setTool("measure")}
          />
          <ToolButton
            active={activeTool === "cut"}
            icon={<Slice className="h-4 w-4" />}
            label={isTouchDevice ? `${advancedMsg}` : "Cut plane (C) • drag in model"}
            onClick={() => setTool("cut")}
            disabled={isTouchDevice}
          />
          <ToolButton
            active={activeTool === "section"}
            icon={<Box className="h-4 w-4" />}
            label={isTouchDevice ? `${advancedMsg}` : "Section view (B)"}
            onClick={() => setTool("section")}
            disabled={isTouchDevice}
          />

          <div className="my-2 h-px bg-slate-200" />

          <ToolButton
            active={false}
            icon={<Palette className="h-4 w-4" />}
            label="Filters / Colorize"
            onClick={() => setRightPanelTab("filters")}
          />
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
            icon={<RotateCcw className="h-4 w-4" />}
            label="Reset view"
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
  disabled,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            className={cn(
              "h-9 w-9 rounded-xl text-slate-700 hover:bg-slate-100",
              active && "bg-slate-900 text-white hover:bg-slate-900"
            )}
            onClick={onClick}
          >
            {icon}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

