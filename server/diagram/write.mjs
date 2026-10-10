#!/usr/bin/env node
/**
 * write — turn a plain spec into a `.excalidraw` file, headlessly.
 *
 *   node server/diagram/write.mjs --spec spec.json --out diagram.excalidraw
 *   cat spec.json | node server/diagram/write.mjs --out diagram.excalidraw
 *
 *   node server/diagram/write.mjs --describe diagram.excalidraw
 *
 * The spec:
 *
 *   {
 *     "title": "Request flow",
 *     "nodes": [
 *       { "id": "client", "label": "Client" },
 *       { "id": "api",    "label": "API", "shape": "ellipse" }
 *     ],
 *     "edges": [ { "from": "client", "to": "api" } ]
 *   }
 *
 * `shape` is one of rectangle (default), ellipse, diamond.
 *
 * No model, no browser, no DOM. Deterministic: the same spec produces a
 * byte-identical file, so a diff means the spec changed.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { buildScene, describeScene } from "./scene.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

if (args.includes("--describe")) {
  const path = flag("describe");
  try {
    const scene = JSON.parse(readFileSync(path, "utf8"));
    console.log(JSON.stringify(describeScene(scene), null, 2));
  } catch (error) {
    console.error(`could not read ${path}: ${error.message}`);
    process.exit(1);
  }
  process.exit(0);
}

const readStdin = () => {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
};

const specPath = flag("spec");
let raw;
if (specPath) {
  try {
    raw = readFileSync(specPath, "utf8");
  } catch (error) {
    console.error(`could not read ${specPath}: ${error.message}`);
    process.exit(1);
  }
} else {
  raw = readStdin();
}

if (!raw.trim()) {
  console.error(
    'no spec: pass --spec <file> or pipe one on stdin. Try {"nodes":[{"id":"a","label":"A"}]}',
  );
  process.exit(2);
}

let spec;
try {
  spec = JSON.parse(raw);
} catch (error) {
  console.error(`the spec is not valid JSON: ${error.message}`);
  process.exit(2);
}

if (flag("title")) {
  spec.title = flag("title");
}

const columns = flag("columns");
const scene = buildScene(spec, {
  seed: Number(flag("seed")) || 1,
  ...(columns ? { columns: Number(columns) } : {}),
});

const out = flag("out") ?? "diagram.excalidraw";
writeFileSync(out, `${JSON.stringify(scene, null, 2)}\n`);

const summary = describeScene(scene);
console.log(`wrote ${out}`);
console.log(
  `  ${summary.elements} elements — ${JSON.stringify(summary.byType)}`,
);
if (summary.labels.length) {
  console.log(`  labels: ${summary.labels.join(", ")}`);
}
