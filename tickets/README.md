# Ticket system

How Excalidraw development work is tracked. Files, not a tool — the ticket lives next to the code it describes, in version control, with the reasoning preserved.

Full method and reasoning: [`../.agents/skills/tickets/SKILL.md`](../.agents/skills/tickets/SKILL.md). The law: [`../RULES/08-tickets.md`](../RULES/08-tickets.md).

---

## Why files

A ticket is a **behaviour contract**. The contract has to outlive the conversation that produced it and be readable by whoever picks it up next — including an agent that has no memory of the original discussion.

Three reasons this is a directory rather than a SaaS backlog:

1. **Version-controlled.** The reasoning changes alongside the code. A diff shows _why_ the contract moved.
2. **No account, no lock-in, no cost.** Data sits in the repo with the thing it describes.
3. **Agent-readable without an API key.** A dispatched agent gets the file path and the contract. Nothing to authenticate against.

The cost is real: no built-in triage views. `grep` is enough for a project this size, and a ticket board inside the tool is itself filed as a ticket (`feature-0006-uw-ticket-board-in-the-tool`).

---

## Layout

```
tickets/
  README.md        this file
  DEVIDS           dev id -> github handle
  _templates/      bug · feature · chore · spike
  open/            filed, awaiting start
  in-progress/     being implemented
  review/          code up, awaiting review
  done/            landed — the folder is the archive
```

Naming: `<type>-<NNNN>-<devid>-<slug>.md`, zero-padded so lexical order matches numeric order.

The **dev id is mandatory** and lives in `tickets/DEVIDS` (`uw` is @zerwiz). The number stays a global counter — every ticket takes the next free one, whoever files it — so a collision is not made less likely by the id, it is made **visible**. `./bin/guards/ticket-ids.sh` enforces the name, the Owner, and that the two agree.

Moving a ticket between folders **is** the status change. `git mv` keeps the history.

## Owner

Every ticket header names a GitHub handle: `**Type** feature · **Status** open · **Risk** medium · **Opened** 2026-10-10 · **Owner** @zerwiz`. A ticket with no owner is not filed — work with no name on it does not start. Who owns which surface is in [`../docs/OWNERS.md`](../docs/OWNERS.md), and `.github/CODEOWNERS` asks GitHub to request the matching review automatically.

---

## The contract

Five sections, each unlocking a question:

| Section      | Unlocks                                         |
| ------------ | ----------------------------------------------- |
| Problem      | are we solving the correct behaviour gap?       |
| Impact       | is this worth doing now, at what urgency?       |
| Requirements | what behaviour must be true after?              |
| Non-goals    | what is explicitly excluded?                    |
| Test cases   | how do we prove success and prevent regression? |

Plus **architecture intent** (why this path, now) and **constraints** (the edges that must hold).

> "Ambiguity does not disappear because a ticket exists. **Ambiguity moves.** If it is not absorbed while writing the ticket, it resurfaces into implementation — where correcting it is more expensive and less coherent."

---

## Before `in-progress/`

Six questions, answerable from the ticket body alone:

1. What is currently wrong?
2. What must be true after this change?
3. What is explicitly excluded?
4. How is success verified?
5. Who is affected if it fails?
6. What constraints must hold?

**If any answer requires opening a chat thread or reconstructing intent from git history, the ticket is not ready.**

---

## Sizing detail to risk

| Risk | Examples here | Required |
| --- | --- | --- |
| **Low** | copy tweak, one-file fix | concise intent + behaviour contract |
| **Medium** | a new view, a new setting, store changes | + constraints, operations note |
| **High** | the collaboration protocol, the export format, anything owning a network connection | + before/after evidence, rollback, both-theme check |

---

## Workflow

```
triage → open → in-progress → review → done
```

1. **Triage** — the six questions above, plus duplicate check. Name the **Owner** before it leaves triage.
2. **In-progress** — only once it passes. Starting on an incomplete contract exports ambiguity into the code.
3. **Review** — verify against **declared** boundaries. If the implementation did something the ticket did not sanction: the code is wrong, or the ticket was. Update the ticket.
4. **Done** — landed **and** verified against the Test cases section.

---

## Anti-patterns

| Anti-pattern | Why it hurts |
| --- | --- |
| Solution-first title ("add a WebSocket heartbeat") | locks the mechanism before the gap is established |
| "Improve X" / vague verbs | unfalsifiable — nothing to review against |
| No non-goals | scope expands silently; reviewers argue from opinion |
| No test cases | "works on my branch" |
| Decisions living in comments | easy to miss, unparseable, unauditable |
| One density for all tickets | process heaviness that gets ignored |
| Closing without verification | the contract was never a contract |
| Fixing an adjacent bug inline | the diff is unreviewable and the bug stays untracked |

---

## This fork's rules that belong in tickets

**No unconfigured egress.** Nothing contacts an Excalidraw-controlled or third-party host — `excalidraw.com` backends, Firebase, Sentry, Vercel telemetry, the hosted AI backend — unless the operator configured it. A ticket that adds a network call names, in Constraints, the exact host and how it is configured. The work to sever the inherited connections is `feature-0001-uw-sever-all-excalidraw-hosted-connections`.

**Self-hosted by default.** Collaboration, storage and AI resolve to `zerwizserver` or `localhost`; the hosted Excalidraw service is never a default.

**Config is never hardcoded.** A port, host, path or credential resolves from env/config with one documented default.

**Gates.** `yarn test:typecheck`, `yarn test:app --watch=false`, `yarn test:code`, `yarn build:app`, and `./bin/guards/ticket-ids.sh`. Every behavioural claim in a Resolution describes the command and its output.

---

## Sources

The method is adapted from the Wayof monorepo ticket system, itself synthesised from:

- [What a Good Engineering Ticket Looks Like](https://nat.io/blog/what-a-good-engineering-ticket-looks-like)
- [Tickets as System Design Artifacts](https://nat.io/blog/tickets-as-system-design-artifacts)
- [Writing Tickets for Software Engineers](https://nickhayden.com/blog/writing-tickets-for-software-engineers/)
- [Smells Depend on the Context (arXiv)](https://arxiv.org/html/2601.04124v2)
- [GitHub issue templates](https://docs.github.com/en/issues/tracking-your-work-with-issues/quickstart)
