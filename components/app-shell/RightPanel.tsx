"use client";

import * as React from "react";
import { Clock3, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useViewer } from "../viewer/ViewerProvider";
import {
  type ViewerMeasurementMode,
  type ViewerPropertyFilterState,
  type ViewerRightPanelTab,
  useViewerStore,
} from "../../lib/viewer/viewerStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Checkbox } from "../ui/checkbox";
import { Slider } from "../ui/slider";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export function RightPanel({
  collapsed,
  onToggleCollapse,
  mobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobile?: boolean;
}) {
  const modelName = useViewerStore((s) => s.modelName);
  const rightPanelTab = useViewerStore((s) => s.rightPanelTab);
  const setRightPanelTab = useViewerStore((s) => s.setRightPanelTab);

  if (collapsed) {
    return (
      <div
        className={
          mobile
            ? "flex h-full items-center justify-center bg-white/90 px-3"
            : "flex h-full flex-col items-center justify-start border-l border-slate-200 bg-white/80 py-3 backdrop-blur"
        }
      >
        <button
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={onToggleCollapse}
        >
          Panel
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        mobile
          ? "flex h-full min-h-0 flex-col overflow-hidden border-t border-slate-200 bg-white/95"
          : "flex h-full min-h-0 flex-col overflow-hidden border-l border-slate-200 bg-white/80 backdrop-blur"
      }
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-semibold text-slate-900">Panel</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">{modelName ?? "No model"}</div>
          <Button variant="outline" size="sm" onClick={onToggleCollapse}>
            {mobile ? "Close" : "Collapse"}
          </Button>
        </div>
      </div>
      <Separator />
      <div className="flex-1 min-h-0">
        <Tabs
          value={rightPanelTab}
          onValueChange={(v) => setRightPanelTab(v as ViewerRightPanelTab)}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="shrink-0 px-3 pt-3">
            <TabsList className="w-full justify-start bg-slate-100">
              <TabsTrigger value="properties">Properties</TabsTrigger>
              <TabsTrigger value="filters">Filters</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="properties"
            className="mt-2 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-1"
          >
            <PropertiesTab />
          </TabsContent>
          <TabsContent
            value="filters"
            className="mt-2 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-1"
          >
            <FiltersTab />
          </TabsContent>
          <TabsContent
            value="history"
            className="mt-2 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-1"
          >
            <HistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PropertiesTab() {
  const { viewer } = useViewer();
  const props = useViewerStore((s) => s.properties);
  const measurements = useViewerStore((s) => s.measurements);
  const measurementMode = useViewerStore((s) => s.measurementMode);
  const isTouchDevice = useViewerStore((s) => s.isTouchDevice);

  const setMeasurementMode = async (mode: ViewerMeasurementMode) => {
    if (!viewer) return;
    viewer.setMeasurementMode(mode);
    await viewer.setActiveTool("measure");
  };

  const isAdvancedMeasureMode = (mode: ViewerMeasurementMode) => mode !== "point";

  return (
    <ScrollArea className="h-full w-full">
      <div className="space-y-3 px-3 py-3">
        {!props ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            Tap/click an element to inspect BIM properties.
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">
                {props.name ?? props.category ?? "Selected element"}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <Row label="GUID" value={props.guid ?? "-"} />
                <Row label="Class" value={props.category ?? "-"} />
                <Row label="Tag" value={props.tag ?? "-"} />
                <Row label="Express ID" value={String(props.localId)} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">Property Sets</div>
              {props.psets.length === 0 ? (
                <div className="mt-2 text-xs text-slate-600">No Psets found.</div>
              ) : (
                <Accordion type="multiple" className="mt-2">
                  {props.psets.map((pset) => (
                    <AccordionItem key={pset.name} value={pset.name}>
                      <AccordionTrigger className="text-sm">{pset.name}</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-1">
                          {pset.props.slice(0, 80).map((p) => (
                            <div key={`${pset.name}-${p.name}`} className="flex items-start justify-between gap-3 text-xs">
                              <div className="text-slate-700">{p.name}</div>
                              <div className="max-w-[190px] text-right text-slate-500">{p.value}</div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Measure in 3D</div>
          <TooltipProvider delayDuration={150}>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([
                { mode: "point", label: "Point to point" },
                { mode: "laser", label: "Laser" },
                { mode: "shortest", label: "Shortest" },
                { mode: "coords", label: "Coordinates" },
              ] as Array<{ mode: ViewerMeasurementMode; label: string }>).map((m) => {
                const disabled = isTouchDevice && isAdvancedMeasureMode(m.mode);
                const btn = (
                  <Button
                    variant={measurementMode === m.mode ? "default" : "outline"}
                    size="sm"
                    onClick={() => void setMeasurementMode(m.mode)}
                    disabled={disabled}
                  >
                    {m.label}
                  </Button>
                );
                if (!disabled) return <React.Fragment key={m.mode}>{btn}</React.Fragment>;
                return (
                  <Tooltip key={m.mode}>
                    <TooltipTrigger asChild>
                      <span>{btn}</span>
                    </TooltipTrigger>
                    <TooltipContent>Advanced tools available on desktop</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>

          {measurements.length === 0 ? (
            <div className="mt-2 text-xs text-slate-600">No measurements yet.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {measurements.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs text-slate-800">{m.meters.toFixed(3)} m</div>
                    <div className="truncate text-[11px] text-slate-500">
                      {m.mode}
                      {m.note ? ` - ${m.note}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => viewer?.removeMeasurement(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => viewer?.clearMeasurements()}>
                Clear all
              </Button>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function FiltersTab() {
  const { viewer } = useViewer();
  const activeTool = useViewerStore((s) => s.activeTool);
  const isTouchDevice = useViewerStore((s) => s.isTouchDevice);

  const classGroups = useViewerStore((s) => s.classGroups);
  const storeyGroups = useViewerStore((s) => s.storeyGroups);
  const classVisibility = useViewerStore((s) => s.classVisibility);
  const storeyVisibility = useViewerStore((s) => s.storeyVisibility);

  const section = useViewerStore((s) => s.section);
  const cut = useViewerStore((s) => s.cut);
  const transform = useViewerStore((s) => s.transform);
  const propertyFilter = useViewerStore((s) => s.propertyFilter);
  const setPropertyFilter = useViewerStore((s) => s.setPropertyFilter);

  const [jsonText, setJsonText] = React.useState("");
  const setFilter = (next: Partial<ViewerPropertyFilterState>) => setPropertyFilter(next);

  const toggleClass = async (id: string, checked: boolean) => {
    if (!viewer) return;
    await viewer.setClassVisible(id, checked);
  };

  const toggleStorey = async (id: string, checked: boolean) => {
    if (!viewer) return;
    await viewer.setStoreyVisible(id, checked);
  };

  return (
    <ScrollArea className="h-full w-full">
      <div className="space-y-3 px-3 py-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Cut (single plane)</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">Enable cut</div>
            <Checkbox checked={cut.enabled} onCheckedChange={(v) => viewer?.enableCut(Boolean(v))} disabled={isTouchDevice} />
          </div>

          <div className="mt-3 flex gap-2">
            {(["x", "y", "z"] as const).map((axis) => (
              <Button
                key={axis}
                variant={cut.axis === axis ? "default" : "outline"}
                size="sm"
                disabled={!cut.enabled || isTouchDevice}
                onClick={() => viewer?.setCutAxis(axis)}
                className="uppercase"
              >
                {axis}
              </Button>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">Flip side</div>
            <Checkbox checked={cut.flip} onCheckedChange={(v) => viewer?.setCutFlip(Boolean(v))} disabled={!cut.enabled || isTouchDevice} />
          </div>

          <div className="mt-3 text-xs font-medium text-slate-700">Offset</div>
          <div className="mt-2">
            <Slider
              value={[cut.offset]}
              min={cut.min}
              max={cut.max}
              step={(cut.max - cut.min) / 200 || 0.01}
              onValueChange={(v) => viewer?.setCutOffset(v[0] ?? 0)}
              disabled={!cut.enabled || isTouchDevice}
            />
            <div className="mt-1 text-[11px] text-slate-500">{cut.offset.toFixed(3)}</div>
            <div className="mt-1 text-[11px] text-slate-500">
              Tip: activate <span className="font-medium">Cut</span> tool and drag directly in the model to scrub the plane.
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Shortcuts: `X` `Y` `Z` axis, `V` cycle axis, `[` and `]` nudge.
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">Hold `Shift` for fine scrub, `Alt` for fast scrub.</div>
          </div>

          <div className="mt-3 text-xs font-medium text-slate-700">Ignore cut for classes</div>
          <div className="mt-2 max-h-28 space-y-2 overflow-auto pr-1">
            {classGroups.length === 0 ? (
              <div className="text-xs text-slate-500">No classes loaded.</div>
            ) : (
              classGroups.slice(0, 30).map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs text-slate-700">{g.label}</div>
                  <Checkbox
                    checked={cut.ignoredClasses.includes(g.id)}
                    onCheckedChange={(v) => viewer?.setCutIgnoredClass(g.id, Boolean(v))}
                    disabled={!cut.enabled || isTouchDevice}
                  />
                </div>
              ))
            )}
          </div>
          {isTouchDevice ? <div className="mt-2 text-[11px] text-slate-500">Advanced tools available on desktop</div> : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Section View (box)</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">Enable section box</div>
            <Checkbox
              checked={section.enabled}
              onCheckedChange={(v) => viewer?.setSectionEnabled(Boolean(v))}
              disabled={isTouchDevice}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">Invert</div>
            <Checkbox
              checked={section.invert}
              onCheckedChange={(v) => viewer?.setSectionInvert(Boolean(v))}
              disabled={!section.enabled || isTouchDevice}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">Lock rotation</div>
            <Checkbox
              checked={section.lockRotation}
              onCheckedChange={(v) => viewer?.setSectionLockRotation(Boolean(v))}
              disabled={!section.enabled || isTouchDevice}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">Show box gizmo</div>
            <Checkbox
              checked={section.showGizmo}
              onCheckedChange={(v) => viewer?.setSectionGizmoVisible(Boolean(v))}
              disabled={!section.enabled || isTouchDevice}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant={section.transformMode === "translate" ? "default" : "outline"}
              size="sm"
              onClick={() => viewer?.setSectionTransformMode("translate")}
              disabled={!section.enabled || isTouchDevice}
            >
              Move
            </Button>
            <Button
              variant={section.transformMode === "rotate" ? "default" : "outline"}
              size="sm"
              onClick={() => viewer?.setSectionTransformMode("rotate")}
              disabled={!section.enabled || section.lockRotation || isTouchDevice}
            >
              Rotate
            </Button>
            <Button
              variant={section.transformMode === "scale" ? "default" : "outline"}
              size="sm"
              onClick={() => viewer?.setSectionTransformMode("scale")}
              disabled={!section.enabled || isTouchDevice}
            >
              Scale
            </Button>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant={activeTool === "section" ? "default" : "outline"}
              size="sm"
              onClick={() => viewer?.setActiveTool("section")}
              disabled={!section.enabled || isTouchDevice}
            >
              Edit box
            </Button>
            <Button variant="outline" size="sm" onClick={() => viewer?.resetSectionBox()} disabled={!section.enabled || isTouchDevice}>
              Reset box
            </Button>
          </div>

          {isTouchDevice ? <div className="mt-2 text-[11px] text-slate-500">Advanced tools available on desktop</div> : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Model Transform</div>
          <div className="mt-2 flex gap-2">
            <Button
              variant={activeTool === "transform" ? "default" : "outline"}
              size="sm"
              onClick={() => viewer?.setActiveTool("transform")}
              disabled={isTouchDevice}
            >
              Edit model
            </Button>
            <Button variant="outline" size="sm" onClick={() => viewer?.resetModelTransform()} disabled={isTouchDevice}>
              Reset transform
            </Button>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              variant={transform.mode === "translate" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                viewer?.setModelTransformMode("translate");
                void viewer?.setActiveTool("transform");
              }}
              disabled={isTouchDevice}
            >
              Move
            </Button>
            <Button
              variant={transform.mode === "rotate" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                viewer?.setModelTransformMode("rotate");
                void viewer?.setActiveTool("transform");
              }}
              disabled={isTouchDevice}
            >
              Rotate ring
            </Button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-600">Show transform gizmo</div>
            <Checkbox
              checked={transform.gizmoVisible}
              onCheckedChange={(v) => viewer?.setModelTransformGizmoVisible(Boolean(v))}
              disabled={isTouchDevice}
            />
          </div>
          <div className="mt-2 text-[11px] text-slate-500">Shortcuts: `W`/`T` move, `E`/`R` rotate, `0` reset.</div>
          {isTouchDevice ? <div className="mt-2 text-[11px] text-slate-500">Advanced tools available on desktop</div> : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Property Filter Builder</div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              placeholder="Property set (e.g. Pset_WallCommon)"
              value={propertyFilter.pset}
              onChange={(e) => setFilter({ pset: e.target.value })}
            />
            <Input
              placeholder="Property name"
              value={propertyFilter.property}
              onChange={(e) => setFilter({ property: e.target.value })}
            />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={propertyFilter.operator}
              onChange={(e) => setFilter({ operator: e.target.value as ViewerPropertyFilterState["operator"] })}
            >
              <option value="contains">contains</option>
              <option value="equals">equals</option>
              <option value="not_equals">not equals</option>
              <option value="gt">&gt;</option>
              <option value="lt">&lt;</option>
              <option value="gte">&gt;=</option>
              <option value="lte">&lt;=</option>
            </select>
            <Input placeholder="Value" value={propertyFilter.value} onChange={(e) => setFilter({ value: e.target.value })} />
          </div>

          <div className="mt-2 flex gap-2">
            <Button variant={propertyFilter.mode === "show" ? "default" : "outline"} size="sm" onClick={() => setFilter({ mode: "show" })}>
              Show only
            </Button>
            <Button
              variant={propertyFilter.mode === "colorize" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter({ mode: "colorize" })}
            >
              Colorize
            </Button>
          </div>

          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => viewer?.applyPropertyFilterFromState()}>
              Apply filter
            </Button>
            <Button variant="outline" size="sm" onClick={() => viewer?.clearPropertyFilter()}>
              Clear filter
            </Button>
          </div>

          <div className="mt-3 text-xs font-medium text-slate-700">Shareable filter JSON</div>
          <textarea
            className="mt-2 h-24 w-full rounded-md border border-slate-200 bg-white p-2 text-xs"
            placeholder="Exported filter JSON"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!viewer) return;
                setJsonText(viewer.exportPropertyFilterJson());
              }}
            >
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!viewer) return;
                try {
                  await viewer.importPropertyFilterJson(jsonText);
                } catch (err) {
                  toast.error("Import failed", {
                    description: err instanceof Error ? err.message : String(err),
                  });
                }
              }}
            >
              Import
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Category Toggles</div>
          <div className="mt-2 space-y-2">
            {classGroups.length === 0 ? (
              <div className="text-xs text-slate-600">Load a model first.</div>
            ) : (
              classGroups.slice(0, 40).map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs text-slate-700">
                    {g.label} <span className="text-slate-500">({g.count})</span>
                  </div>
                  <Checkbox checked={classVisibility[g.id] !== false} onCheckedChange={(v) => void toggleClass(g.id, Boolean(v))} />
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">Storeys</div>
          <div className="mt-2 space-y-2">
            {storeyGroups.length === 0 ? (
              <div className="text-xs text-slate-600">No storeys detected.</div>
            ) : (
              storeyGroups.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs text-slate-700">
                    {g.label} <span className="text-slate-500">({g.count})</span>
                  </div>
                  <Checkbox checked={storeyVisibility[g.id] !== false} onCheckedChange={(v) => void toggleStorey(g.id, Boolean(v))} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function HistoryTab() {
  const history = useViewerStore((s) => s.history);
  const clearHistory = useViewerStore((s) => s.clearHistory);

  return (
    <ScrollArea className="h-full w-full">
      <div className="space-y-2 px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">Object History</div>
          <Button variant="outline" size="sm" onClick={clearHistory}>
            Clear
          </Button>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            No history yet. Select elements, inspect properties, change visibility, or load a new IFC revision.
          </div>
        ) : (
          history.map((it) => (
            <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs font-semibold text-slate-900">{it.title}</div>
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(it.ts).toLocaleTimeString()}
                </div>
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">{it.type}</div>
              {it.details ? <div className="mt-1 text-xs text-slate-700">{it.details}</div> : null}
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-xs text-slate-800">{value}</div>
    </div>
  );
}
