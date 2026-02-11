"use client";

import * as React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { cn } from "../../lib/utils";
import { useViewerStore } from "../../lib/viewer/viewerStore";
import { ViewerProvider } from "../viewer/ViewerProvider";
import { ViewerCanvas } from "../viewer/ViewerCanvas";
import { TopBar } from "./TopBar";
import { LeftToolbar } from "./LeftToolbar";
import { RightPanel } from "./RightPanel";
import { StatusBar } from "./StatusBar";

export function AppShell() {
  return (
    <ViewerProvider>
      <div className="h-screen w-screen overflow-hidden bg-[radial-gradient(1200px_900px_at_10%_10%,rgba(14,165,233,0.10),transparent),radial-gradient(900px_700px_at_70%_30%,rgba(249,115,22,0.10),transparent)]">
        <div className="grid h-full grid-rows-[52px_1fr_30px]">
          <TopBar />
          <Main />
          <StatusBar />
        </div>
      </div>
    </ViewerProvider>
  );
}

function Main() {
  const topTab = useViewerStore((s) => s.topTab);
  const setIsTouchDevice = useViewerStore((s) => s.setIsTouchDevice);
  const rightPanelRef = React.useRef<ImperativePanelHandle | null>(null);
  const [rightCollapsed, setRightCollapsed] = React.useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = React.useState(false);
  const [isTouchDevice, setLocalIsTouchDevice] = React.useState(false);

  React.useEffect(() => {
    const mqCoarse = window.matchMedia("(pointer: coarse)");
    const mqAnyCoarse = window.matchMedia("(any-pointer: coarse)");
    const mqHoverNone = window.matchMedia("(hover: none)");

    const sync = () => {
      const hasTouchPoints = navigator.maxTouchPoints > 0;
      const next =
        mqCoarse.matches || (mqAnyCoarse.matches && mqHoverNone.matches) || (hasTouchPoints && mqHoverNone.matches);
      setLocalIsTouchDevice(next);
      setIsTouchDevice(next);
    };

    sync();
    mqCoarse.addEventListener("change", sync);
    mqAnyCoarse.addEventListener("change", sync);
    mqHoverNone.addEventListener("change", sync);
    return () => {
      mqCoarse.removeEventListener("change", sync);
      mqAnyCoarse.removeEventListener("change", sync);
      mqHoverNone.removeEventListener("change", sync);
    };
  }, [setIsTouchDevice]);

  if (topTab !== "viewer") {
    const title =
      topTab === "info"
        ? "Informationsstyring"
        : topTab === "site"
          ? "Byggepladsledelse"
          : "Facility Management";

    return (
      <div className="flex h-full items-center justify-center px-4">
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-panel backdrop-blur">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          <div className="mt-2 text-sm text-slate-600">
            Demo placeholder content. Switch to <span className="font-medium text-slate-900">BIM Viewer</span> to
            navigate, inspect properties, cut/section, measure, filter/colorize, and review object history.
          </div>
        </div>
      </div>
    );
  }

  if (isTouchDevice) {
    return (
      <div className="relative h-full">
        <ViewerCanvas />
        <LeftToolbar />

        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-30 transition-all duration-300",
            mobileSheetOpen ? "h-[52%]" : "h-[40px]"
          )}
        >
          <div className="flex h-10 items-center justify-center border-t border-slate-200 bg-white/95">
            <button
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
              onClick={() => setMobileSheetOpen((v) => !v)}
            >
              {mobileSheetOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {mobileSheetOpen ? "Hide panel" : "Show panel"}
            </button>
          </div>

          <div className="h-[calc(100%-40px)] overflow-hidden border-t border-slate-200 bg-white">
            <RightPanel
              collapsed={!mobileSheetOpen}
              mobile
              onToggleCollapse={() => setMobileSheetOpen((v) => !v)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" className="h-full">
      <Panel defaultSize={75} minSize={40}>
        <div className="relative h-full">
          <ViewerCanvas />
          <LeftToolbar />
        </div>
      </Panel>
      <PanelResizeHandle className="w-2 bg-transparent transition-colors hover:bg-slate-200/60" />
      <Panel
        ref={rightPanelRef}
        defaultSize={25}
        minSize={18}
        maxSize={45}
        collapsible
        collapsedSize={3}
        onCollapse={() => setRightCollapsed(true)}
        onExpand={() => setRightCollapsed(false)}
      >
        <RightPanel
          collapsed={rightCollapsed}
          onToggleCollapse={() => {
            const p = rightPanelRef.current;
            if (!p) return;
            if (p.isCollapsed()) p.expand();
            else p.collapse();
          }}
        />
      </Panel>
    </PanelGroup>
  );
}

