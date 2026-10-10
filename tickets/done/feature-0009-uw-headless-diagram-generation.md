# feature-0009-uw-headless-diagram-generation

**Type** feature · **Status** done · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** producing a diagram required a model, a browser, and a conversation. None of those is necessary — a `.excalidraw` file is JSON. **Expected:** a diagram can be written from a plain spec, deterministically, with no model and no DOM.

## Impact

**Affected:** agents and scripts. This is the capability that makes the fork programmable rather than merely usable.

## Architecture intent

Pure generation, separate from any transport, so a future gateway or the AI bridge can consume the same shape.

## Requirements

- `{title?, nodes:[{id,label?,shape?}], edges:[{from,to}]}` produces a real scene; `shape` is rectangle (default), ellipse or diamond.
- A labelled shape is a **container bound to its text** (`boundElements` / `containerId`), not a text element floating over a box.
- Output is **deterministic**: the same spec twice is byte-identical.
- An edge naming a node that does not exist is **dropped**, not invented; an empty spec produces an empty scene, not an error.
- The scene must survive the app's own `restoreElements`.

## Non-goals

No automatic graph layout beyond a deterministic grid; no styling language; no Mermaid parsing (see `spike-0001`).

## Test cases

- **Positive:** a 4-node/3-edge spec restores with real geometry and bound labels.
- **Negative:** an edge to a ghost node produces no arrow.
- **Compatibility:** `serializeAsJSON` round-trips it; mounting it in the app keeps every element.

## Constraints

No DOM, no dependency; field names mirror the app's own fixtures.

## Resolution

**Landed** (commit `e186b390`). `server/diagram/scene.mjs` + `write.mjs`; 9 tests in `packages/excalidraw/tests/diagramFromSpec.test.tsx` including a mount test proving `window.h` holds all 12 elements with the right types. Driven from the ymir door as `excalidraw_diagram`.
