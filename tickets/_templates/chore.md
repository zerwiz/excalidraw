# chore-0000-uw-short-description

**Type** chore · **Status** open · **Risk** low|medium|high · **Opened** YYYY-MM-DD · **Owner** @handle

## Problem

**Current:** what exists today, and why it costs us. **Expected:** the tidier state.

## Impact

**Affected:** who is slowed down by the current state. **Risk if not built:** what continuing to live with it costs.

## Architecture intent

One line: why this cleanup, now.

## Requirements

- The observable state after the chore.
- Nothing functional changes (or, name exactly what does).

## Constraints

- No behaviour change beyond the stated one.
- No hardcoded absolute paths; config resolves from env/config with one default.

## Non-goals

Explicitly excluded.

## Test cases

- **Positive:** the chore's target state holds.
- **Negative:** the removed thing is actually gone (`grep` returns nothing).
- **Compatibility:** build and tests still pass.

## Resolution

_(filled on close)_
