---
name: tickets
description: Write and manage Excalidraw development tickets in tickets/ — the five-section behaviour contract (Problem, Impact, Requirements, Non-goals, Test cases) plus architecture intent and constraints. Use when filing a bug or feature ticket, triaging, splitting, or closing development work in this repo.
---

# Excalidraw tickets

Tickets live in `tickets/` as files, not a tool. A ticket is a **bounded behaviour
contract**: someone who has never spoken to you must be able to implement it, review it, and
prove it finished without reconstructing intent from chat history.

Run from the repository root.

---

## The problem this solves

Ambiguity in a ticket does not disappear because a ticket exists. **It moves.** If it is not
absorbed while writing the ticket, it resurfaces later — as questions in the first hour of
implementation, as review disputes about scope, and as silent drift away from system intent.

This matters more here than in a human-only team, because agents pick up work. An agent has
**no memory of the conversation that produced the ticket**, so anything left implicit is
not merely lost — it is invisible.

---

## Layout

```
tickets/
  README.md          the operating model
  DEVIDS             dev id -> github handle
  _templates/        bug.md · feature.md · chore.md · spike.md
  open/              filed, not started
  in-progress/       being implemented
  review/            code up, awaiting review
  done/              landed — the folder is the archive
```

File naming: `<type>-<NNNN>-<devid>-<slug>.md` — e.g. `feature-0001-uw-sever-all-excalidraw-hosted-connections.md`.

The dev id is mandatory and comes from `tickets/DEVIDS` (`uw` is @zerwiz). Zero-padded so
lexical order matches numeric order and the next number is obvious. Type prefixes:
`bug` · `feature` · `chore` · `spike`.

**Moving the file between folders is the status change:**

```bash
git mv tickets/open/<file> tickets/in-progress/<file>
```

---

## Owner — required before the ticket leaves triage

Every ticket header names a GitHub handle:

```
**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz
```

A ticket with no owner is not filed: work with no name on it does not start. The surface
decides the handle — `docs/OWNERS.md` is the map and `.github/CODEOWNERS` makes GitHub
request the matching review automatically.

---

## The five sections

| Section | Unlocks | Fails when… |
|---|---|---|
| **Problem** | are we solving the correct behaviour gap? | you write the *solution* first |
| **Impact** | is this worth doing now, at what urgency? | severity is implied, never stated |
| **Requirements** | what behaviour must be true after? | they say "improve" or "make robust" |
| **Non-goals** | what is explicitly excluded? | scope expands by default |
| **Test cases** | how do we prove success and prevent regression? | success is unfalsifiable |

Two more sections carry the **design signal**:

- **Architecture intent** — one line: *why this path, now?*
- **Constraints** — the non-negotiable edges, each one checkable in review.

### Non-goals are the most underused section

They are **sequencing statements**. Without them, a reviewer cannot tell whether a diff that
also fixes two adjacent things drifted or improved. With them, that becomes mechanical.

---

## Writing rules

### Problem first, solution second

The most common anti-pattern is a solution-first ticket: *"add a WebSocket heartbeat"*. State
**Current** (what happens now, observably) and **Expected** (what should happen). Only then
describe the mechanism. Often the stated mechanism turns out to be the wrong one.

### Requirements are conditions, not intentions

Test each sentence: *could this fail?*

- ❌ "improve collaboration"
- ✅ "with the collaboration server unreachable, the editor still opens and saves locally"
- ✅ "`grep -rE 'excalidraw\.com' excalidraw-app/` returns no runtime URL"

If a sentence contains a verb like *improve, better, robust, clean, optimise* — it is an
intention, not a contract. Rewrite it.

### Bug tickets need a reproduction

For a `bug`: exact steps, the input, the actual result, the expected result. **Cite
`file:line`.** If you cannot reproduce it, that is a `spike`, not a bug.

### Scale detail to risk

| Risk | Examples here | Required |
|---|---|---|
| **Low** | a copy tweak, one-file fix | concise intent + core behaviour contract |
| **Medium** | a new view, a new setting, store changes | + constraints, operations note |
| **High** | the collaboration protocol, the export format, anything that owns a network connection | + before/after evidence, rollback criteria, both-theme check |

Structure quality is about **explicitness, not length**.

---

## Splitting

Split when a ticket cannot be stated as one behaviour contract — typically when its
Requirements contain an "and" joining two independent outcomes.

**Split by behaviour, not by layer.** Record links so the dependency is visible:
`Blocked by: feature-0003`, `Blocks: feature-0004`.

---

## Workflow

```
triage → open → in-progress → review → done
```

**Triage** before `open/`:

1. Does the Problem state a behaviour gap, or only a solution?
2. Are Requirements falsifiable?
3. Are Non-goals present?
4. Is there at least one positive **and** one negative test case?
5. For a bug: reproducible, with `file:line`?
6. Duplicate? Link and close rather than leaving two.

**In-progress** only when the ticket passes triage.

**Review** verifies against **declared** boundaries, not inferred intent. If the
implementation did something the ticket did not sanction, either the code is wrong or the
ticket was wrong — update the ticket, don't leave the history inconsistent.

**Done** means landed and verified against the Test cases section.

---

## Known anti-patterns

| Anti-pattern | Why it hurts |
|---|---|
| Solution-first title | locks the mechanism before the gap is established |
| "Improve X" / vague verbs | unfalsifiable; nothing to review against |
| No non-goals | scope expands silently |
| No test cases | "works on my branch" |
| Tickets as a to-do list | no contract, so no leverage |
| Decisions living in comments | important, easy to miss, unauditable |
| One density for all tickets | process heaviness that gets ignored |
| Closing without verification | the contract was never a contract |
| Fixing an adjacent bug inline | the diff is unreviewable and the bug stays untracked |

---

## This fork's specifics

- **No unconfigured egress.** Nothing contacts an Excalidraw-controlled or third-party host
  (excalidraw.com backends, Firebase, Sentry, Vercel telemetry, the hosted AI backend) unless
  the operator configured it. A ticket adding a network call names the host in Constraints.
  See `tickets/open/feature-0001-uw-*`.
- **Self-hosted by default** — collaboration, storage and AI point at `zerwizserver` or
  `localhost`.
- **Config is never hardcoded** — a port, host, path or credential resolves from env/config
  with one documented default (`RULES/08`).
- **Append-only records** — `tickets/`, `RULES/` and `docs/fixes/` are appended to, never
  rewritten.
- **Gates:** `yarn test:typecheck`, `yarn test:app --watch=false`, `yarn test:code`,
  `yarn build:app`, and `./bin/guards/ticket-ids.sh`. A Resolution describes what was run and
  what it printed; never write "tests pass" without the command.
