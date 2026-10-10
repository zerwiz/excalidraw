# feature-0015-uw-diagram-to-code-from-a-drawing

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** the bridge answers the panel's `diagram-to-code` route with an explicit _"not implemented yet"_ error frame. The panel offers **Wireframe to code** and gets nothing. **Expected:** a drawing goes in, code comes out — or the feature is **hidden**, not offered.

## Impact

**Affected:** anyone who clicks the button. An offered-but-refused feature is worse than an absent one: it reads as a defect.

## Architecture intent

This needs the **vision** path — an image in — which is a different capability from text-to-diagram, not a variation of it. It therefore gets its own decision about which model serves it.

## Requirements

- Either implement the route against a vision-capable model configured in Settings, or **hide the entry** when no vision model is configured.
- The panel's request contract is unchanged: an SSE stream of the same frame shapes.
- The image is sent to the model the operator configured, and to no other host.
- A failed or timed-out generation produces an error frame the panel renders, never a hang.

## Non-goals

Not a code-quality promise; not a general screenshot-to-app generator; not a new UI.

## Test cases

- **Positive:** with a vision model configured, a drawing returns streamed code.
- **Negative:** with no vision model, the entry is hidden (or the route says exactly what is missing, and the panel shows it).
- **Negative:** an upstream error becomes an error frame, not a spinner.

## Constraints

No new dependency; the bridge logs timing and token counts, never a prompt or an image.

## Resolution

_(filled on close)_
