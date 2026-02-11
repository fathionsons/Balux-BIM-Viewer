"use client";

import * as React from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

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
  const rightPanelRef = React.useRef<ImperativePanelHandle | null>(null);
  const [rightCollapsed, setRightCollapsed] = React.useState(false);

  if (topTab !== "viewer") {
    const title = topTab === "info" ? "Info" : topTab === "site" ? "Site" : "FM";

    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-xl rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-panel backdrop-blur">
          <div className="text-lg font-semibold text-slate-900">{title}</div>

          {topTab === "info" ? (
            <div className="mt-2 space-y-3 text-sm text-slate-700">
              <div>
                <span className="font-medium text-slate-900">BALUX — BIM Viewer (Web) by Fathi</span>
              </div>
              <div className="font-medium text-slate-900">Technologies used:</div>
              <ul className="list-disc space-y-1 pl-5">
                <li>Next.js + React + TypeScript</li>
                <li>three.js</li>
                <li>
                  That Open Engine: <code>@thatopen/components</code>,{" "}
                  <code>@thatopen/components-front</code>, <code>@thatopen/fragments</code>
                </li>
                <li>web-ifc</li>
                <li>three-mesh-bvh</li>
                <li>Zustand</li>
                <li>Tailwind CSS + Radix UI</li>
              </ul>
            </div>
          ) : (
            <div className="mt-2 text-sm text-slate-600">
              This is a placeholder tab. Switch back to{" "}
              <span className="font-medium text-slate-900">BIM Viewer</span> to
              interact with the model.
            </div>
          )}
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
