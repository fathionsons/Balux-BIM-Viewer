# BALUX — BIM Viewer (Web) by Fathi

Production-quality BIM Viewer demo with an app-like UX: fast hover + selection, hide/isolate, section box cut, and 3D measurements.

## Features (Checklist)

- [x] Fullscreen viewer shell (tabs, toolbar, dockable right panel, status bar)
- [x] Load IFC
  - [x] Sample model at `public/sample.ifc` (fallback: `public/models/sample.ifc`)
  - [x] Local file picker (no upload; loads in-browser)
  - [x] Progress UI + no UI freeze (IFC conversion in worker)
  - [x] Fit to model after load
- [x] Optional visual model (GLB)
  - [x] "Load house (GLB)" button loads `public/house.glb` (fallback: `public/models/house.glb`)
  - [x] Sectioning + measurements work (no BIM metadata: no GUID/Psets/tree/filters)
- [x] Interaction quality (Blender-like)
  - [x] Damped orbit/pan/zoom controls
  - [x] Hover highlight (subtle) + selection highlight (strong)
  - [x] Shift-click multi-select
  - [x] Double-click focuses hovered/selection
  - [x] Keyboard shortcuts:
    - `F` frame selection
    - `H` hide selected
    - `Shift+H` isolate selected
    - `Alt+H` unhide all
    - `Esc` exit tool / clear selection
- [x] Picking + performance
  - [x] `three-mesh-bvh` acceleration with worker-built BVHs
  - [x] `Raycaster.firstHitOnly = true` for snappy picking
- [x] BIM data + properties
  - [x] GUID, IFC class, Name/Tag (if present)
  - [x] Property sets (Psets/Qtos) in an accordion
  - [x] Search by Name/Tag/ObjectType/category and select results
- [x] Visibility + filters
  - [x] Hide selected / isolate selected / unhide all
  - [x] Checkbox filters by IFC class and storey (no reload; just visibility toggles)
- [x] Sectioning (premium)
  - [x] Box Cut: draggable transform gizmo + 6 clipping planes
  - [x] Plane Cut: X/Y/Z axis + offset slider
  - [x] Toggle, reset, invert cut
  - [x] No material recreation per-frame (clipping plane references updated in place)
- [x] Measurement tool
  - [x] Click two points on geometry to measure
  - [x] Line + in-scene label (meters)
  - [x] Multiple measurements + list + delete

## Tech Stack

- Next.js (App Router) + TypeScript
- three.js renderer
- That Open Engine:
  - `@thatopen/components`
  - `@thatopen/components-front`
  - `@thatopen/fragments`
  - `web-ifc`
- `three-mesh-bvh` for fast raycasting/picking
- shadcn-style UI components (Radix + Tailwind) for panels/toolbars
- Zustand for viewer state
- Web Workers:
  - That Open Fragments worker for IFC -> Fragments conversion
  - Custom BVH worker for `three-mesh-bvh` builds

## Architecture (High Level)

```
app/page.tsx (Server)  --->  components/app-shell/AppShell.tsx (Client)
                                  |
                                  v
                          components/viewer/ViewerCanvas.tsx
                                  |
                                  v
                           lib/viewer/ViewerApp.ts
             +--------------------+--------------------+--------------------+
             |                    |                    |                    |
             v                    v                    v                    v
     Tool system           Selection/UX            Sectioning           Measurement
 (ToolManager + tools)   (Highlighter/Outliner) (SectionManager)   (MeasurementManager)
             |
             v
     Performance & picking
  (BvhManager + workers/bvh.worker.ts)
             |
             v
     That Open core pipeline
  (FragmentsManager + IfcLoader + Hider)
             |
             v
 public/workers/fragments.worker.mjs  (Frags worker served as a real URL)
```

## Repo Layout

```
app/                      Next.js routes + global styles
components/
  app-shell/              Top tabs, left toolbar, right panel, status bar
  ui/                     shadcn-style components (Radix + Tailwind)
  viewer/                 ViewerProvider + ViewerCanvas (mounts ViewerApp)
lib/
  viewer/
    ViewerApp.ts          Main viewer orchestrator (world, loading, selection, tools)
    viewerStore.ts        Zustand state (selection, tools, filters, section, measurements)
    bvh/                  BVH manager + acceleration wiring
    measure/              Measurement manager (lines + CSS2D labels)
    section/              Box/plane clipping manager (TransformControls + clipping planes)
    tools/                Tool system (Select/Measure/SectionBox)
workers/
  bvh.worker.ts           Builds serialized BVHs off the main thread
public/
  sample.ifc              Sample IFC
  house.glb               Optional GLB visual model
  models/sample.ifc       Optional fallback location for sample IFC
  models/house.glb        Optional fallback location for GLB
  wasm/                   web-ifc WASM binaries (copied postinstall)
  workers/                fragments.worker.mjs (copied postinstall)
scripts/
  postinstall.mjs         Copies WASM + fragments worker into /public
```

## Running Locally

1. Install dependencies (also runs `postinstall` to copy required WASM/worker assets):

```bash
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open `http://localhost:3000` and click "Load sample" or "Open IFC...".

Optional: add a GLB visual model at `public/house.glb` (or `public/models/house.glb`) and click "Load house (GLB)".

## Notes / Performance

- **IFC conversion is threaded**: `FragmentsManager.init("/workers/fragments.worker.mjs")` points to a real, static worker URL served from `public/`.
- **BVH building is off-main-thread**: `BvhManager` uses `workers/bvh.worker.ts` and transfers position/index buffers to avoid cloning large typed arrays.
- **Raycasting is accelerated** by patching `Mesh.raycast` to `three-mesh-bvh`'s `acceleratedRaycast`, and enabling `Raycaster.firstHitOnly`.
- **Stable clipping**: sectioning updates clipping plane arrays in place; it does not recreate materials per interaction.
- **Build script** uses webpack (`next build --webpack`) to avoid intermittent Windows directory-locking issues seen with Turbopack in some environments.
- **Dev script** also uses webpack (`next dev --webpack`) for consistency and reliable Worker bundling.

## Roadmap (What Next)

1. BCF issue workflow (create/view issues, snapshots, and viewpoints)
2. Multi-model federation (load multiple IFCs, shared classification + global isolate)
3. 2D drawings overlay (plan sheets + 3D alignment)
4. Smarter measurement modes (axis-aligned, shortest distance between objects)
5. Saved views, annotations, and scene states (filters + section + visibility presets)

Inspired by:
<img width="2000" height="855" alt="dalux_logo_" src="https://github.com/user-attachments/assets/920f42d7-4b0c-47c6-84b7-dc1f3f48ec71" />
