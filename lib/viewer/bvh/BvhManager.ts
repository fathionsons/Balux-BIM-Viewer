import * as THREE from "three";
import { MeshBVH, acceleratedRaycast, type SerializedBVH } from "three-mesh-bvh/src/index.js";

import { createId } from "../id";

export type BVHBuildProgress = {
  total: number;
  done: number;
};

type WorkerSuccess = {
  id: string;
  position: Float32Array | Float64Array;
  index: Uint16Array | Uint32Array;
  serialized: unknown;
};

type WorkerError = { id: string; error: string };

function isWorkerSuccess(msg: unknown): msg is WorkerSuccess {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return typeof m.id === "string" && "serialized" in m && m.serialized != null;
}

function isWorkerError(msg: unknown): msg is WorkerError {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return typeof m.id === "string" && typeof m.error === "string";
}

// three-mesh-bvh requires patching Mesh.raycast to use the boundsTree if present.
let bvhPatched = false;
function ensureBVHPatching() {
  if (bvhPatched) return;
  bvhPatched = true;

  // Patch Mesh + InstancedMesh.
  (THREE.Mesh.prototype as unknown as { raycast: typeof acceleratedRaycast }).raycast =
    acceleratedRaycast;
  (THREE.InstancedMesh.prototype as unknown as { raycast: typeof acceleratedRaycast }).raycast =
    acceleratedRaycast;

  // Enable "first hit only" for snappy selection.
  (THREE.Raycaster.prototype as unknown as { firstHitOnly?: boolean }).firstHitOnly = true;
}

export class BvhManager {
  private worker: Worker | null = null;
  private workerDisabled = false;
  private pending = new Map<
    string,
    {
      resolve: (payload: WorkerSuccess) => void;
      reject: (err: Error) => void;
    }
  >();

  constructor() {
    ensureBVHPatching();
  }

  dispose() {
    this.rejectAllPending(new Error("BVH manager disposed."));
    this.worker?.terminate();
    this.worker = null;
    this.workerDisabled = true;
  }

  private rejectAllPending(err: Error) {
    for (const entry of this.pending.values()) {
      entry.reject(err);
    }
    this.pending.clear();
  }

  private disableWorker(err: Error) {
    this.rejectAllPending(err);
    this.worker?.terminate();
    this.worker = null;
    this.workerDisabled = true;
  }

  private getWorker() {
    if (this.workerDisabled) return null;
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL("../../../workers/bvh.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      this.workerDisabled = true;
      return null;
    }

    this.worker.onmessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (isWorkerSuccess(msg)) {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        entry.resolve(msg);
      } else if (isWorkerError(msg)) {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        entry.reject(new Error(msg.error));
      }
    };

    this.worker.onmessageerror = () => {
      this.disableWorker(new Error("BVH worker message deserialization failed."));
    };

    this.worker.onerror = (ev: ErrorEvent) => {
      const reason = ev.message ? `: ${ev.message}` : "";
      this.disableWorker(new Error(`BVH worker runtime failure${reason}`));
    };

    return this.worker;
  }

  private buildGeometryBVHLocal(geometry: THREE.BufferGeometry) {
    const geomWithBvh = geometry as THREE.BufferGeometry & { boundsTree?: MeshBVH };
    if (geomWithBvh.boundsTree) return Promise.resolve();

    const bvh = new MeshBVH(geometry, { maxLeafTris: 3 });
    geomWithBvh.boundsTree = bvh;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return Promise.resolve();
  }

  private buildGeometryBVH(geometry: THREE.BufferGeometry): Promise<void> {
    // Already built.
    const geomWithBvh = geometry as THREE.BufferGeometry & { boundsTree?: MeshBVH };
    if (geomWithBvh.boundsTree) return Promise.resolve();

    const posAttr = geometry.getAttribute("position");
    if (!posAttr) return Promise.resolve();
    if ((posAttr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
      return Promise.resolve();
    }
    const position = posAttr.array as Float32Array | Float64Array;
    const index = geometry.index ? (geometry.index.array as Uint16Array | Uint32Array) : null;
    const worker = this.getWorker();
    if (!worker) {
      return this.buildGeometryBVHLocal(geometry);
    }

    // Send copies to the worker so we can safely fallback to local BVH build on failures/timeouts
    // without risking detached geometry buffers on the render thread.
    const positionCopy = position.slice() as Float32Array | Float64Array;
    const indexCopy = index ? (index.slice() as Uint16Array | Uint32Array) : null;

    const id = createId("bvh");

    const p = new Promise<WorkerSuccess>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    try {
      worker.postMessage(
        {
          id,
          position: positionCopy,
          index: indexCopy,
          options: {
            // Reasonable default; callers can tune per-model if desired.
            maxLeafTris: 3,
          },
        },
        [
          positionCopy.buffer,
          ...(indexCopy ? [indexCopy.buffer] : []),
        ].filter((b) =>
          typeof SharedArrayBuffer === "undefined" ? true : !(b instanceof SharedArrayBuffer)
        )
      );
    } catch {
      this.pending.delete(id);
      this.disableWorker(new Error("BVH worker transfer failed."));
      return this.buildGeometryBVHLocal(geometry);
    }

    const timeoutMs = 8_000;
    const timed = new Promise<WorkerSuccess>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`BVH worker timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      p.then(
        (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });

    return timed
      .then((res) => {
        const bvh = MeshBVH.deserialize(res.serialized as SerializedBVH, geometry, {
          setIndex: false,
        });
        geomWithBvh.boundsTree = bvh;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
      })
      .catch(() => {
        console.warn("BVH worker failed; switching to local BVH build.");
        this.disableWorker(new Error("BVH worker failed; falling back to local BVH build."));
        return this.buildGeometryBVHLocal(geometry);
      });
  }

  async buildForObject(
    root: THREE.Object3D,
    opts?: { onProgress?: (p: BVHBuildProgress) => void }
  ) {
    ensureBVHPatching();

    const geometries = new Set<THREE.BufferGeometry>();
    root.traverse((obj: THREE.Object3D) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry) return;
      geometries.add(mesh.geometry as THREE.BufferGeometry);
    });

    const all = [...geometries];
    const total = all.length;
    let done = 0;
    opts?.onProgress?.({ total, done });

    for (const geom of all) {
      await this.buildGeometryBVH(geom);
      done += 1;
      opts?.onProgress?.({ total, done });
    }
  }
}
