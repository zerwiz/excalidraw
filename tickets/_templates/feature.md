# feature-0000-uw-short-description

**Type** feature · **Status** open · **Risk** low|medium|high · **Opened** YYYY-MM-DD · **Owner** @handle

## Problem

**Current:** what exists today, and the gap.

**Expected:** the behaviour that closes it.

## Impact

**Affected:** who gains what.
**Risk if not built:** what it costs to wait.
**Urgency:** why now.

## Architecture intent

One line: why this capability, in this shape, now.

## Requirements

- Post-change behaviour contract. Each falsifiable.
- Include the negative case explicitly — what the system must refuse to do.

## Constraints

- Interface/schema stability.
- No request leaves the machine for an Excalidraw-controlled or third-party host
  unless the operator configured it (`RULES/08`, ticket feature-0001).
- No hardcoded absolute paths; config resolves from env/config with one default.
- Any new surface must render under both the light and dark theme blocks.

## Non-goals

Explicitly excluded. Name the tempting adjacent work you are refusing here.

## Test cases

- **Positive:** the new behaviour works.
- **Negative:** invalid input is rejected, with the exact response.
- **Compatibility:** nothing existing regressed.

## Operations *(medium/high risk only)*

**Rollout:** how it reaches users.
**Observability:** what signal tells you it worked — and what tells you it broke.
**Rollback:** the trigger and the mechanism.

## Resolution

*(filled on close)*
