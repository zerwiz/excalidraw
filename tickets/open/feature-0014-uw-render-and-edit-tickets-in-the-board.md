# feature-0014-uw-render-and-edit-tickets-in-the-board

**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** the board (`feature-0006`) is read-only and shows a ticket body as **pre-formatted text**. Every edit means opening an editor, and a table renders as pipes. **Expected:** the body renders, and the board can move a ticket between columns.

## Impact

**Affected:** the team reading tickets in the tool. Unrendered markdown is the difference between a board people use and a board they open once.

## Architecture intent

The **files stay the source of truth**. A write path is a narrow, guarded one — move a file between status directories — not a document editor.

## Requirements

- The body renders headings, lists, tables, code and links.
- A card can be moved between the four columns; the move is a `git mv` on the server, so history is preserved and the filename's status matches its folder.
- Moving a ticket that fails the naming guard is **refused**, with the guard's own message.
- No free-text editing of a ticket body in v1 — the contract is authored in a file, on purpose.
- Every write is logged (who, what, when) and the log carries no ticket content.

## Non-goals

Not a markdown editor; not drag-and-drop across a network; not issue-tracker features (assignees, priorities, sprints); not a second backlog.

## Test cases

- **Positive:** a table and a code block render; moving a card changes its folder and its filename.
- **Negative:** moving a malformed filename is refused with the guard's message.
- **Negative:** a body edit through the API is refused — there is no such route.
- **Compatibility:** with no board configured, nothing renders and nothing errors.

## Constraints

The board's server stays read-only for content; the only write is a status move. Path traversal stays refused.

## Resolution

_(filled on close)_
