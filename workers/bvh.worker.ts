/// <reference lib="webworker" />
import { BufferAttribute, BufferGeometry } from "three";
import { MeshBVH, type SerializedBVH } from "three-mesh-bvh/src/index.js";

type BVHBuildRequest = {
  id: string;
  position: Float32Array | Float64Array;
  index: Uint16Array | Uint32Array | null;
  options?: {
    maxLeafTris?: number;
    strategy?: number;
  };
};

type BVHBuildResponse = {
  id: string;
  position: Float32Array | Float64Array;
  index: Uint16Array | Uint32Array;
  serialized: SerializedBVH;
};

type BVHBuildError = { id: string; error: string };

// A minimal BVH builder worker. We transfer position/index buffers in and out
// to avoid cloning large typed arrays.
self.onmessage = (ev: MessageEvent<BVHBuildRequest>) => {
  const { id, position, index, options } = ev.data;
  try {
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(position, 3));
    if (index) {
      geom.setIndex(new BufferAttribute(index, 1));
    }

    const bvh = new MeshBVH(geom, options);
    const serialized = MeshBVH.serialize(bvh, { cloneBuffers: false });

    const idxView = serialized.index;
    const idx =
      idxView instanceof Uint16Array || idxView instanceof Uint32Array ? idxView : null;
    if (idx == null) {
      throw new Error("BVH serialize did not include an index buffer.");
    }

    const res: BVHBuildResponse = {
      id,
      position,
      index: idx,
      serialized,
    };

    const transfer: Transferable[] = [];
    transfer.push(position.buffer);
    // `idx` is a typed array.
    transfer.push(idx.buffer);
    // BVH roots are ArrayBuffers; transfer them to avoid cloning.
    for (const root of serialized.roots) {
      transfer.push(root);
    }

    self.postMessage(res, transfer);
  } catch (e) {
    const err: BVHBuildError = { id, error: e instanceof Error ? e.message : String(e) };
    self.postMessage(err);
  }
};
