# feature-0011-uw-deploy-the-services-to-zerwizserver

**Type** feature · **Status** open · **Risk** high · **Opened** 2026-10-10 · **Owner** @zerwiz

## Problem

**Current:** every part of the fork runs **only on the operator's laptop**. `zerwizserver` runs CasaOS, Docker, PostgreSQL 16 and Ollama, serves a homepage on `:80`, the A2A heart on `:8301` and a POST-only API on `:8321` — but **nothing of Excalidraw**. A team cannot collaborate against a machine that is asleep in a bag, and a room link built on a tailnet name that points at a laptop works only while that laptop is open. **Expected:** the app, the room server, the text-to-diagram bridge and the tickets board run on `zerwizserver`, reachable by the team, with the room link pointing there.

## Impact

**Affected:** the entire premise — "a tool we in our team can collaborate in". **Risk if not built:** the fork is a very capable single-player editor. **Urgency:** every earlier ticket is now blocked on this one for real use.

## Architecture intent

Ship the services the way the server already ships things — **systemd units or Compose**, behind the existing ingress pattern — rather than inventing a new one. The fork's servers are plain Node with no build step, so the deploy is a checkout plus env plus a unit.

## Requirements

- The app is served at a stable address the team reaches; `publicUrl` names it.
- The room server, the bridge and the board run as supervised services that **survive a reboot**.
- The room server is reachable over the tailnet; its origin allow-list names the app's real origin.
- Settings on each member's machine point at those addresses, or the deployment ships them as env defaults for that install.
- No TLS-by-absence: if the app is served over HTTP on a tailnet, that is a stated decision with its consequence written down, not an oversight.
- The bridge's model points at a model **on or reachable from that server**, and the bridge refuses to start without one — as it already does.

## Constraints

- No secret in the repo: the bridge's key and the members registry live on the server, supplied by env.
- The room server's access registry is **not** in the repo (see `feature-0004`).
- The fork's ports stay in its own block (`chore-0002`).
- Nothing may be exposed publicly without the operator's explicit word; a tailnet-only deployment is the default posture.

## Non-goals

Not a public SaaS; not multi-tenant; not autoscaling; not a CI/CD pipeline; not a domain purchase.

## Test cases

- **Positive:** a second machine on the tailnet opens the app, starts a session, and a third joins by the room link — with the room link naming `zerwizserver`, not a laptop.
- **Positive:** after a server reboot, all services answer again without a human.
- **Negative:** with no model configured, the bridge refuses to start and says why.
- **Negative:** a protected room still refuses a client with no token (grace `feature-0004`).
- **Compatibility:** local development on a laptop still works unchanged.

## Operations

**Rollout:** stand the services up, then point one member at them before pointing everyone. **Observability:** each service's `/healthz`, plus the bridge's request log (timing and token counts only) and the room server's room/member counts. **Rollback:** stop the units; laptops keep working locally because every endpoint is configurable.

## Resolution

_(filled on close)_
