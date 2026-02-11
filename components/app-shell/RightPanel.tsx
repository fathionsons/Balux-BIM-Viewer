"use client";

import * as React from "react";
import { Search, Trash2 } from "lucide-react";

import { useViewer } from "../viewer/ViewerProvider";
import { useViewerStore } from "../../lib/viewer/viewerStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Checkbox } from "../ui/checkbox";
import { Slider } from "../ui/slider";
import { Separator } from "../ui/separator";

export function RightPanel({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const modelName = useViewerStore((s) => s.modelName);

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center justify-start border-l border-slate-200 bg-white/80 py-3 backdrop-blur">
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
    <div className="flex h-full flex-col border-l border-slate-200 bg-white/80 backdrop-blur">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-semibold text-slate-900">Panel</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500">{modelName ?? "No model"}</div>
          <Button variant="outline" size="sm" onClick={onToggleCollapse}>
            Collapse
          </Button>
        </div>
      </div>
      <Separator />
      <div className="flex-1">
        <Tabs defaultValue="properties" className="h-full">
          <div className="px-3 pt-3">
            <TabsList className="w-full justify-start bg-slate-100">
              <TabsTrigger value="properties">Properties</TabsTrigger>
              <TabsTrigger value="tree">Model Tree</TabsTrigger>
              <TabsTrigger value="filters">Filters</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="properties" className="h-[calc(100%-56px)]">
            <PropertiesTab />
          </TabsContent>
          <TabsContent value="tree" className="h-[calc(100%-56px)]">
            <TreeTab />
          </TabsContent>
          <TabsContent value="filters" className="h-[calc(100%-56px)]">
            <FiltersTab />
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

  return (
    <ScrollArea className="h-full px-3 py-3">
      {!props ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
          Click an element to inspect its properties.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-sm font-semibold text-slate-900">
              {props.name ?? props.category ?? "Selected element"}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <Row label="GUID" value={props.guid ?? "-"} />
              <Row label="Class" value={props.category ?? "-"} />
              <Row label="Tag" value={props.tag ?? "-"} />
              <Row label="Local ID" value={String(props.localId)} />
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
                    <AccordionTrigger className="text-sm">
                      {pset.name}
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1">
                        {pset.props.slice(0, 60).map((p) => (
                          <div key={`${pset.name}-${p.name}`} className="flex items-start justify-between gap-3 text-xs">
                            <div className="text-slate-700">{p.name}</div>
                            <div className="max-w-[180px] text-right text-slate-500">
                              {p.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-sm font-semibold text-slate-900">
              Measurements
            </div>
            {measurements.length === 0 ? (
              <div className="mt-2 text-xs text-slate-600">
                Use the Measure tool to create distance measurements.
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {measurements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                  >
                    <div className="text-xs text-slate-700">
                      {m.meters.toFixed(3)} m
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => viewer?.clearMeasurements()}
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </ScrollArea>
  );
}

function TreeTab() {
  const { viewer } = useViewer();
  const classGroups = useViewerStore((s) => s.classGroups);
  const storeyGroups = useViewerStore((s) => s.storeyGroups);

  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Array<{ modelId: string; localId: number; label: string }>>([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (!viewer) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      void (async () => {
        const r = await viewer.search(q);
        if (!active) return;
        setResults(r);
        setSearching(false);
      })();
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, viewer]);

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name / tag / class..."
          />
        </div>

        {searching ? (
          <div className="mt-2 text-xs text-slate-500">Searching...</div>
        ) : results.length > 0 ? (
          <div className="mt-2 space-y-1">
            {results.slice(0, 15).map((r) => (
              <button
                key={`${r.modelId}-${r.localId}`}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs text-slate-800 hover:bg-slate-100"
                onClick={async () => {
                  if (!viewer) return;
                  await viewer.selectElement({ modelId: r.modelId, localId: r.localId });
                }}
              >
                {r.label}
              </button>
            ))}
            <div className="mt-1 text-[11px] text-slate-500">
              Showing top {Math.min(results.length, 15)} results.
            </div>
          </div>
        ) : query.trim().length >= 2 ? (
          <div className="mt-2 text-xs text-slate-500">No results.</div>
        ) : (
          <div className="mt-2 text-xs text-slate-500">
            Type at least 2 characters.
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Storeys</div>
        <div className="mt-2 space-y-1">
          {storeyGroups.length === 0 ? (
            <div className="text-xs text-slate-600">No storeys found.</div>
          ) : (
            storeyGroups.map((s) => (
              <button
                key={s.id}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs text-slate-800 hover:bg-slate-100"
                onClick={() => viewer?.selectGroup({ type: "storey", id: s.id })}
              >
                {s.label}{" "}
                <span className="text-slate-500">({s.count})</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Classes</div>
        <div className="mt-2 space-y-1">
          {classGroups.length === 0 ? (
            <div className="text-xs text-slate-600">No classes found.</div>
          ) : (
            classGroups.slice(0, 30).map((c) => (
              <button
                key={c.id}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-xs text-slate-800 hover:bg-slate-100"
                onClick={() => viewer?.selectGroup({ type: "class", id: c.id })}
              >
                {c.label}{" "}
                <span className="text-slate-500">({c.count})</span>
              </button>
            ))
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

function FiltersTab() {
  const { viewer } = useViewer();
  const classGroups = useViewerStore((s) => s.classGroups);
  const storeyGroups = useViewerStore((s) => s.storeyGroups);
  const classVisibility = useViewerStore((s) => s.classVisibility);
  const storeyVisibility = useViewerStore((s) => s.storeyVisibility);
  const section = useViewerStore((s) => s.section);

  const toggleClass = async (id: string, checked: boolean) => {
    if (!viewer) return;
    await viewer.setClassVisible(id, checked);
  };

  const toggleStorey = async (id: string, checked: boolean) => {
    if (!viewer) return;
    await viewer.setStoreyVisible(id, checked);
  };

  const setSectionEnabled = (v: boolean) => viewer?.setSectionEnabled(v);
  const setSectionMode = (v: "box" | "plane") => viewer?.setSectionMode(v);
  const setInvert = (v: boolean) => viewer?.setSectionInvert(v);

  return (
    <ScrollArea className="h-full px-3 py-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Section / Box Cut</div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-600">Enable sectioning</div>
          <Checkbox
            checked={section.enabled}
            onCheckedChange={(v) => setSectionEnabled(Boolean(v))}
          />
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            variant={section.mode === "box" ? "default" : "outline"}
            size="sm"
            onClick={() => setSectionMode("box")}
            disabled={!section.enabled}
          >
            Box
          </Button>
          <Button
            variant={section.mode === "plane" ? "default" : "outline"}
            size="sm"
            onClick={() => setSectionMode("plane")}
            disabled={!section.enabled}
          >
            Plane
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-600">Invert cut</div>
          <Checkbox
            checked={section.invert}
            onCheckedChange={(v) => setInvert(Boolean(v))}
            disabled={!section.enabled}
          />
        </div>

        {section.mode === "box" ? (
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewer?.resetSectionBox()}
              disabled={!section.enabled}
            >
              Reset box
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => viewer?.setActiveTool("section")}
              disabled={!section.enabled}
            >
              Edit box
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <div className="text-xs font-medium text-slate-700">Axis</div>
            <div className="mt-2 flex gap-2">
              {(["x", "y", "z"] as const).map((ax) => (
                <Button
                  key={ax}
                  variant={section.plane.axis === ax ? "default" : "outline"}
                  size="sm"
                  onClick={() => viewer?.setSectionPlane(ax, section.plane.offset)}
                  disabled={!section.enabled}
                >
                  {ax.toUpperCase()}
                </Button>
              ))}
            </div>

            <div className="mt-3 text-xs font-medium text-slate-700">Offset</div>
            <div className="mt-2">
              <Slider
                value={[section.plane.offset]}
                min={section.plane.min}
                max={section.plane.max}
                step={(section.plane.max - section.plane.min) / 200 || 0.01}
                onValueChange={(v) => viewer?.setSectionPlane(section.plane.axis, v[0] ?? 0)}
                disabled={!section.enabled}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                {section.plane.offset.toFixed(3)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Class Filters</div>
        <div className="mt-2 space-y-2">
          {classGroups.length === 0 ? (
            <div className="text-xs text-slate-600">Load a model first.</div>
          ) : (
            classGroups.slice(0, 40).map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-700">
                  {g.label} <span className="text-slate-500">({g.count})</span>
                </div>
                <Checkbox
                  checked={classVisibility[g.id] !== false}
                  onCheckedChange={(v) => toggleClass(g.id, Boolean(v))}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Storey Filters</div>
        <div className="mt-2 space-y-2">
          {storeyGroups.length === 0 ? (
            <div className="text-xs text-slate-600">No storeys detected.</div>
          ) : (
            storeyGroups.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2">
                <div className="text-xs text-slate-700">
                  {g.label} <span className="text-slate-500">({g.count})</span>
                </div>
                <Checkbox
                  checked={storeyVisibility[g.id] !== false}
                  onCheckedChange={(v) => toggleStorey(g.id, Boolean(v))}
                />
              </div>
            ))
          )}
        </div>
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
