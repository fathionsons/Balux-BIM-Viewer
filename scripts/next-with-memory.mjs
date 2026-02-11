import { spawn } from "node:child_process";
import os from "node:os";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripNodeOption(input, flagName) {
  if (!input) return "";
  const flag = escapeRegExp(flagName);
  // Support `--flag=value`
  let out = input.replace(new RegExp(`(^|\\s)${flag}=\\S+`, "g"), " ");
  // Support `--flag value`
  out = out.replace(new RegExp(`(^|\\s)${flag}\\s+\\S+`, "g"), " ");
  return out.replace(/\s+/g, " ").trim();
}

function buildNodeOptions(existing, extraArgs) {
  let out = existing || "";
  for (const flag of [
    "--max-old-space-size",
    "--max_old_space_size",
    "--max-semi-space-size",
  ]) {
    out = stripNodeOption(out, flag);
  }
  out = out.trim();
  const suffix = extraArgs.join(" ").trim();
  if (!suffix) return out;
  if (!out) return suffix;
  return `${out} ${suffix}`;
}

const nextArgs = process.argv.slice(2);
if (nextArgs.length === 0) {
  console.error(
    "Usage: node scripts/next-with-memory.mjs <next args...>\n" +
      "Example: node scripts/next-with-memory.mjs dev --webpack"
  );
  process.exit(1);
}

// Keep the cap reasonable for dev machines, but avoid tiny heaps that crash webpack.
const totalMemMB = Math.floor(os.totalmem() / 1024 / 1024);
const maxOldSpaceSizeMB = Math.min(
  8192,
  Math.max(2048, Math.floor(totalMemMB * 0.5))
);
const maxSemiSpaceSizeMB = 128;

const memoryNodeOptions = [
  `--max-old-space-size=${maxOldSpaceSizeMB}`,
  `--max-semi-space-size=${maxSemiSpaceSizeMB}`,
];

const nextBin = require.resolve("next/dist/bin/next");

const env = { ...process.env };
env.NODE_OPTIONS = buildNodeOptions(env.NODE_OPTIONS, memoryNodeOptions);

const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (typeof code === "number") process.exit(code);
  if (signal) process.exit(1);
  process.exit(1);
});

