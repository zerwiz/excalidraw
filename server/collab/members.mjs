#!/usr/bin/env node
/**
 * members — the operator's door for access to the collaboration server.
 *
 *   node server/collab/members.mjs add <handle> [display name]
 *   node server/collab/members.mjs invite [room-id] [--ttl-days N]
 *   node server/collab/members.mjs revoke <invite-code>
 *   node server/collab/members.mjs protect <room-id>
 *   node server/collab/members.mjs unprotect <room-id>
 *   node server/collab/members.mjs list
 *
 * Writes `COLLAB_MEMBERS` (default server/collab/members.json). The registry
 * holds **token HASHES**, never tokens: `add` prints the token ONCE and cannot
 * print it again, because it does not keep it.
 *
 * Nothing here reads a room. The server cannot read one, so this cannot either.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  issueInvite,
  loadRegistry,
  newToken,
  hashToken,
  normalizeRegistry,
  revokeInvite,
} from "./access.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(
  process.env.COLLAB_MEMBERS ?? resolve(here, "members.json"),
);

const registry = loadRegistry(registryPath);

const save = () => {
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
};

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "add": {
    const handle = rest[0];
    if (!handle) {
      console.error("usage: members.mjs add <handle> [display name]");
      process.exit(2);
    }
    if (registry.members.some((member) => member.handle === handle)) {
      console.error(`'${handle}' is already a member.`);
      process.exit(1);
    }
    const token = newToken();
    registry.members.push({
      handle,
      displayName: rest.slice(1).join(" ") || handle,
      tokenHash: hashToken(token),
    });
    save();
    console.log(`added ${handle} to ${registryPath}`);
    console.log("");
    console.log(`  token: ${token}`);
    console.log("");
    console.log("Show this once — only its hash was stored, so it cannot be printed again.");
    break;
  }

  case "invite": {
    const ttlFlag = rest.indexOf("--ttl-days");
    const ttlDays = ttlFlag === -1 ? undefined : Number(rest[ttlFlag + 1]);
    const roomId = rest.find((arg) => !arg.startsWith("--") && arg !== String(ttlDays));
    const invite = issueInvite(registry, {
      ...(roomId ? { roomId } : {}),
      ...(Number.isFinite(ttlDays) ? { ttlMs: ttlDays * 24 * 60 * 60 * 1000 } : {}),
    });
    save();
    console.log(`invite for ${roomId ?? "any protected room"}:`);
    console.log("");
    console.log(`  code: ${invite.code}`);
    console.log(`  expires: ${new Date(invite.expiresAt).toISOString()}`);
    break;
  }

  case "revoke": {
    const code = rest[0];
    if (!code || !revokeInvite(registry, code)) {
      console.error("no such invite — pass the exact code.");
      process.exit(1);
    }
    save();
    console.log(`revoked ${code}. A revoked invite fails to join on the next attempt.`);
    break;
  }

  case "protect":
  case "unprotect": {
    const roomId = rest[0];
    if (!roomId) {
      console.error(`usage: members.mjs ${command} <room-id>`);
      process.exit(2);
    }
    if (command === "protect") {
      if (!registry.protectedRooms.includes(roomId)) {
        registry.protectedRooms.push(roomId);
      }
    } else {
      registry.protectedRooms = registry.protectedRooms.filter((id) => id !== roomId);
    }
    save();
    console.log(
      `${roomId} is now ${command === "protect" ? "PROTECTED" : "public"}.`,
    );
    break;
  }

  case "list": {
    console.log(`registry: ${registryPath}`);
    console.log(`members (${registry.members.length}):`);
    for (const member of registry.members) {
      console.log(`  ${member.handle}  "${member.displayName}"`);
    }
    console.log(`protected rooms (${registry.protectedRooms.length}):`);
    for (const roomId of registry.protectedRooms) {
      console.log(`  ${roomId}`);
    }
    const live = registry.invites.filter(
      (invite) => !invite.revoked && (!invite.expiresAt || invite.expiresAt > Date.now()),
    );
    console.log(`live invites (${live.length}):`);
    for (const invite of live) {
      console.log(
        `  ${invite.code}  ${invite.roomId ?? "any"}  expires ${new Date(invite.expiresAt).toISOString()}`,
      );
    }
    break;
  }

  default:
    console.log(
      "usage: members.mjs add <handle> [display name] | invite [room-id] [--ttl-days N] " +
        "| revoke <code> | protect <room-id> | unprotect <room-id> | list",
    );
    process.exit(command ? 2 : 0);
}

// Keep the shape the server reads even if the file did not exist before.
const reread = normalizeRegistry(JSON.parse(readFileSync(registryPath, "utf8")));
if (!reread) {
  console.error("the registry could not be re-read — it is malformed.");
  process.exit(1);
}
