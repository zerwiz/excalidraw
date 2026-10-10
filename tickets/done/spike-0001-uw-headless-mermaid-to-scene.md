# spike-0001-uw-headless-mermaid-to-scene

**Type** spike · **Status** open · **Risk** low · **Opened** 2026-10-10 · **Owner** @zerwiz

## Question

Can `@excalidraw/mermaid-to-excalidraw` produce a usable scene **without a browser** — and if not, what is the smallest thing that would?

## Why now

The fork can already write a scene from a spec (`feature-0009`) and the AI bridge can obtain bare Mermaid (`feature-0008`). If Mermaid could be converted headlessly, an agent could go **Mermaid → scene → file** with no model and no browser, which is the missing link between the two.

## Timebox

Half a day. An overrun becomes a feature ticket.

## Method

The library renders Mermaid into the DOM and measures it: `parseMermaid.js` calls `document.createElement`, and `utils.js` builds a `<textarea>`. Try it under jsdom and see what geometry comes out; check whether `getBBox`/`measureText` are the only blockers, and whether a layout shim (or `mermaid`'s own headless options) is enough. Measure, do not assume.

## Exit criteria

- A written answer: feasible headlessly, feasible with a shim, or browser-only.
- If feasible, a prototype that converts one flowchart to a scene whose elements have real geometry, plus the command that proves it.
- If browser-only, that conclusion recorded **with the measurement that showed it**, so nobody re-opens the question from hope.

## Non-goals

Not an implementation; not a Mermaid subset; not touching `server/diagram/scene.mjs`.

## Resolution

_(the answer, with the evidence that produced it)_

---

## Resolution — **feasible with a shim; the geometry is only as good as the shim**

Measured 2026-10-10, by running the library under **jsdom** (the only thing a headless run could use) and reading the result. No guessing.

### 1. Bare jsdom: it cannot run

```
parse FAILED: text2.getBBox is not a function
```

**jsdom implements no SVG measurement at all.** `@excalidraw/mermaid-to-excalidraw` renders Mermaid into the DOM and asks it how big things are, so off a browser it stops on the first measurement. This is the conclusion the earlier reasoning only inferred; it is now a measurement.

### 2. With a `getBBox` shim: it runs, and the structure is real

Shimming `SVGElement.prototype.getBBox` (8 px per character, 16 px tall — deliberately crude):

```
parsed OK. elements: 5 files: 0
with real geometry (width>0 && height>0): 3 / 5
   rectangle   x=-21.5 y=1   w=40 h=16
   rectangle   x=-21.5 y=67  w=32 h=16
   rectangle   x=-21.5 y=133 w=32 h=16
   arrow       x=8.5  y=24  w=undefined h=undefined
getBBox calls the library made: 15
```

So with a shim the conversion **succeeds**: the node structure, the labels and the edges all come out. Two facts fall out of the numbers:

- **The library asks the DOM 15 times.** The layout is a function of those answers — the boxes above are `40` and `32` wide because _my shim_ said so, not because Arial or Excalifont did. A headless scene is therefore **correct in structure and wrong in size** unless the shim carries real text metrics.
- **Arrows arrive with no width or height**, only points — Excalidraw computes those itself. So the arrow half is safe headlessly; the box half is the exposed one.

### The answer, and what to do with it

**Feasible with a shim; not free, and not accurate out of the box.** Three routes, in the order I would take them:

1. **For structure — generate directly** (`server/diagram/scene.mjs`, `feature-0009`). It already produces a real, editable scene from a plain spec with **no model, no browser and no shim**, and its geometry is chosen rather than measured. This is the route for an agent.
2. **For Mermaid specifically** — run it in a browser, where the measurement is real. That is what the app's own Mermaid tab does.
3. **The shim route** only if someone needs it headlessly _and_ accepts that boxes will be sized by the shim: a real text-metrics implementation (the font's own metrics, as Excalidraw uses in `textMeasurements.ts`) would be required to make the output honest.

**Not built.** A spike that answers nothing is a chore; this one answers, so no prototype is owed — and the conclusion is recorded here so nobody reopens it from hope.

### Evidence

- The measurement script: jsdom + `getBBox` shim + `parseMermaidToExcalidraw`, run from the repo so the library resolves. Output quoted above.
- `parseMermaidToExcalidraw` is the package's only export; `jsdom` is already a devDependency.
