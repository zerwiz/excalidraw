# feature-0006-uw-ticket-board-in-the-tool

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** tickets are files under `tickets/`, readable only by whoever has the clone. The team
shares a tool but cannot see what work is open, in progress or awaiting review without reading
the repository.

**Expected:** a **Tickets** view in the tool showing the four columns — open, in-progress,
review, done — read from the repository's `tickets/` directory.

## Impact

**Affected:** the team. It closes the gap the file-based system leaves open: no shared triage view.
**Risk if not built:** tickets exist but nobody looks; the contract discipline decays.
**Urgency:** low — the files are authoritative either way. Build this after the collaboration and
settings work, not before.

## Architecture intent

The **files remain the source of truth**; the board is a read-only projection of them. Writing
through the UI is deliberately out of scope, so the board can never become a second, divergent
backlog.

## Requirements

- A `Tickets` view renders four columns from `tickets/{open,in-progress,review,done}/`.
- Each card shows the ticket's title, type, status, risk and owner, parsed from the filename and
  the header line.
- Selecting a card renders the ticket body — Problem, Impact, Requirements, Non-goals, Test
  cases, Constraints.
- The view marks a ticket whose header is malformed, or whose filename id disagrees with its
  Owner, using the same rule `bin/guards/ticket-ids.sh` enforces.
- With no tickets present, the view renders an empty state; it does not error.
- The view is read-only. There is no edit, drag or create action in v1.

## Constraints

- The tickets directory is read through a server endpoint (the tool is a browser app and cannot
  read the filesystem directly); that endpoint is read-only and serves only `tickets/**`.
- No ticket content is sent to a third-party host.
- File paths served are confined to the tickets root; a path traversal request is refused.
- The render is correct under both light and dark themes.

## Non-goals

- No editing, moving or creating tickets from the UI.
- No burndown, velocity or time tracking.
- No GitHub Issues sync.
- No replacement of the files — the view is a lens, not a store.

## Test cases

- **Positive:** with the current `tickets/open/` set, the view lists every ticket under the
  correct column with its owner and risk.
- **Positive:** opening a card shows all five contract sections.
- **Negative:** a malformed filename or a mismatched Owner is visibly flagged, matching
  `bin/guards/ticket-ids.sh`.
- **Negative:** a request for `../RULES/08-tickets.md` through the tickets endpoint is refused.
- **Compatibility:** the view renders with an empty `tickets/` directory.

## Operations

**Rollout:** ship behind the app menu.
**Observability:** the endpoint logs requests, never ticket bodies.
**Rollback:** hide the view; the files are unaffected.

## Resolution

*(filled on close)*
