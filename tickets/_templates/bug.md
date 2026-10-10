# bug-0000-uw-short-description

**Type** bug · **Status** open · **Risk** low|medium|high · **Opened** YYYY-MM-DD · **Owner** @handle

## Problem

**Current:** what happens now, observably, with `file:line`.
**Expected:** what should happen.

## Reproduction

1. Steps.
2. Exact input.
3. **Actual:** …
4. **Expected:** …

If you cannot reproduce it, this is a `spike`, not a bug.

## Impact

**Affected:** who hits it, and how often.
**Risk if not fixed:** what it costs to leave.

## Architecture intent

One line: why the fix belongs here and not somewhere else.

## Requirements

- The behaviour that must be true after.
- The state that must remain impossible.

## Constraints

- Keep the change local; do not fix an adjacent bug inline — file it.
- No hardcoded absolute paths; config resolves from env/config with one default.

## Non-goals

Explicitly excluded.

## Test cases

- **Positive:** the fix works.
- **Negative:** the previously-broken input is rejected or handled, with the exact response.
- **Compatibility:** nothing existing regressed.

## Resolution

*(filled on close)*
