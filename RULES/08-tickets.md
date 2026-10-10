# Rule 08 — A behaviour contract before implementation

**Work starts against a ticket whose contract is answerable without guessing. New problems
are filed, not fixed inline.**

## The law

```
ticket_contract[6]{section,unlocks}:
  "Problem","are we solving the correct behaviour gap? (Current vs Expected)"
  "Impact","is this worth doing now, at what urgency?"
  "Requirements","what behaviour must be true after?"
  "Non-goals","what is explicitly excluded?"
  "Test cases","how is success proven and regression prevented?"
  "Architecture intent + Constraints","what must hold, and why this path"
```

## How an agent works tickets

```
workflow[6]{step,action}:
  "1","ls tickets/in-progress/ and tickets/open/ — never start work that already has a ticket"
  "2","claim by moving: git mv tickets/open/<f> tickets/in-progress/<f>"
  "3","answer the six readiness questions from the ticket body alone; if any needs guessing, fix the ticket first"
  "4","follow the Non-goals; file adjacent work as a new ticket"
  "5","run the gates (build + tests + lint + ./bin/guards/ticket-ids.sh)"
  "6","verify against Test cases, then move to review/ and fill Resolution"
```

## The six readiness questions

What is wrong · what must be true after · what is excluded · how success is verified · who is
affected if it fails · what constraints hold. **If any answer requires opening a chat thread
or reconstructing intent from history, the ticket is not ready.**

## Why a rule and not a preference

> Ambiguity does not disappear because a ticket exists. **Ambiguity moves.** Unabsorbed at
> authoring, it reappears as questions during implementation and as scope disputes during
> review — where correcting it is more expensive and less coherent.

It bites hardest with agents: **a dispatched agent has no memory of the conversation that
produced the ticket.** Anything left implicit is not merely lost, it is invisible.

## Writing rules

- Requirements are **observable conditions that can fail**. "Improve the model" is not a
  requirement; "the exported `.excalidraw` JSON is byte-identical across two runs" is.
- Reject the verbs *improve, better, robust, clean, optimise* — they are intentions, not
  contracts.
- Problem before solution: "add a WebSocket heartbeat" locks a mechanism before the gap is
  established. Sometimes the gap was a missing reconnect, visible in the logs.
- Test cases need at least one **positive** and one **negative** path.
- Scale detail to risk. Low: contract only. High (collaboration protocol, the export format,
  anything that owns a network connection): add rollout, rollback, observability.

## This fork's constraints that belong in tickets

- **No unconfigured egress.** The fork must not contact an Excalidraw-controlled or
  third-party host (excalidraw.com backends, Firebase, Sentry, Vercel telemetry, the hosted
  AI backend) unless the operator explicitly configured that endpoint. A ticket that adds a
  network call states, in Constraints, the exact host it talks to and how it is configured.
  See `tickets/open/feature-0001-*`.
- **Self-hosted by default.** Collaboration, storage and AI resolve to a self-hosted
  endpoint (`zerwizserver` or `localhost`); the hosted Excalidraw service is never a default.
- **Config is never hardcoded** — a port, host, path or credential resolves from env/config
  with one documented default.
- **Append-only records** — `tickets/`, `RULES/` and `docs/fixes/` are appended to, never
  rewritten. A correction is a new entry citing the old one.

## Related

`tickets/README.md`, `.agents/skills/tickets/SKILL.md`.

---

## Correction, 2026-10-10 — a ticket number carries a dev id

Appended, not rewritten. The naming was `<type>-<NNNN>-<slug>.md` before this correction;
the number alone was the collision.

Two developers filing at once could pick the same number, and the collision was only visible
by reading file contents — not by listing the directory.

```
naming[2]{rule,detail}:
  "the number is a global counter","every ticket takes the next free number, whoever files it — the id does not create a per-dev numbering"
  "the dev id is mandatory","a ticket without one is not filed, exactly as a ticket without an Owner is not"
```

Filename: `<type>-<NNNN>-<devid>-<slug>.md`. The dev ids live in `tickets/DEVIDS`, so adding
a teammate is one line, and `bin/guards/ticket-ids.sh` reads that file rather than a
hardcoded list.
