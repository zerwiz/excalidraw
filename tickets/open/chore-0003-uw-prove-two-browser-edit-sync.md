# chore-0003-uw-prove-two-browser-edit-sync

**Type** chore · **Status** open · **Risk** low · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** `feature-0003` proved the protocol with **two real socket.io clients**, and proved two browser sessions share a roster — but a **human-drawn element crossing between two browser tabs is unverified**. The tooling available could not drive a real canvas drag (synthetic pointer events made a degenerate dot; the automation helper only moves DOM elements). **Expected:** the visual end-to-end check done once, by hand, and recorded.

## Impact

**Affected:** confidence. Everything up to the last centimetre is proven; the last centimetre is asserted by inference, which is exactly the habit this repository's ticket method exists to break.

## Architecture intent

A verification chore, not a code change. If it **fails**, it becomes a bug ticket with a reproduction.

## Requirements

- Two browser sessions join one room on the self-hosted server.
- An element drawn in one appears in the other within 1 second, with the correct label if labelled.
- A cursor follows, and follow-mode follows.
- The result is recorded in this ticket's Resolution with the room server's roster as evidence.

## Non-goals

Not an automated browser test harness — that is a bigger decision, and this is the manual check.

## Test cases

- **Positive:** the drawn element appears in the second session.
- **Negative:** if it does not, this ticket is closed as a **bug** naming what was observed.

## Resolution

_(filled on close)_
