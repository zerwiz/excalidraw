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
