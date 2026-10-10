# feature-0008-uw-model-replies-that-parse

**Type** feature · **Status** done · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** the AI panel expects **bare Mermaid** and showed _"Mermaid syntax error"_ against a general coding model, because that model wrapped its answer in prose or a code fence. The transport worked; the reply was unusable. **Expected:** what reaches the panel is Mermaid, and nothing else.

## Impact

**Affected:** anyone using text-to-diagram with a general model. A model that answers correctly is indistinguishable from one that cannot, which makes the feature look broken.

## Architecture intent

This is the **bridge's** job, not the operator's: the bridge exists to translate between the panel's contract and any model, and "make the reply parseable" is part of that contract.

## Requirements

- The bridge prepends an instruction demanding Mermaid only — no prose, no fences — overridable with `TTD_SYSTEM_PROMPT`, and it must not double up if the caller already sent a system message.
- A code fence is stripped, **including when it arrives split across streaming deltas**: a leading fence is held back until it can be told from content, and a lookback tail catches a closing fence.
- The transform must not buffer the whole completion, and must not eat the head of a reply that merely starts with a backtick.

## Non-goals

Not prompt-engineering for quality; not a Mermaid validator; not touching the panel's parser.

## Test cases

- **Positive:** a bare diagram passes through byte-identical.
- **Positive:** `mermaid … ` is stripped, split across deltas or not.
- **Negative:** a reply starting with backtick-ish content is not truncated.
- **Compatibility:** the frame contract is unchanged.

## Constraints

The client contract is untouched; no new dependency; the instruction is operator-overridable.

## Resolution

**Landed** (commit `e186b390`). `DEFAULT_SYSTEM_PROMPT` + `withSystemPrompt` + `createFenceFilter` (look-ahead and lookback in one state machine), wired through `translateUpstream`. Proved live: this machine's 35b returned `flowchart TD / Start --> Work --> Done` and the panel rendered it. 7 new tests.
