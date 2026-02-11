import fs from "node:fs/promises";
import path from "node:path";

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function main() {
  const root = process.cwd();

  // web-ifc WASM (served from /public so web-ifc can fetch it at runtime)
  await copyFile(
    path.join(root, "node_modules", "web-ifc", "web-ifc.wasm"),
    path.join(root, "public", "wasm", "web-ifc.wasm")
  );
  await copyFile(
    path.join(root, "node_modules", "web-ifc", "web-ifc-mt.wasm"),
    path.join(root, "public", "wasm", "web-ifc-mt.wasm")
  );

  // That Open Fragments worker bundle (required by FragmentsManager.init)
  await copyFile(
    path.join(root, "node_modules", "@thatopen", "fragments", "dist", "Worker", "worker.mjs"),
    path.join(root, "public", "workers", "fragments.worker.mjs")
  );
}

main().catch((err) => {
  console.error("[postinstall] failed:", err);
  process.exitCode = 1;
});

