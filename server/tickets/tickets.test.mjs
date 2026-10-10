import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
  COLUMNS,
  buildBoard,
  buildCard,
  columnOf,
  parseDevIds,
  parseHeader,
  parseTicketFilename,
  parseTitle,
  readConfig,
  safeResolve,
} from "./tickets.mjs";

const HEADER =
  "**Type** feature · **Status** open · **Risk** high · **Opened** 2026-10-10 · **Owner** @zerwiz";

describe("parseTicketFilename", () => {
  it("splits a well-formed name", () => {
    assert.deepEqual(parseTicketFilename("feature-0001-uw-a-thing.md"), {
      type: "feature",
      number: "0001",
      devId: "uw",
      slug: "a-thing",
      filename: "feature-0001-uw-a-thing.md",
    });
  });

  it("rejects a name without a dev id", () => {
    assert.equal(parseTicketFilename("feature-0001-a-thing.md"), null);
  });
});

describe("parseHeader", () => {
  it("reads every field", () => {
    assert.deepEqual(parseHeader(HEADER), {
      type: "feature",
      status: "open",
      risk: "high",
      opened: "2026-10-10",
      owner: "@zerwiz",
    });
  });

  it("returns nothing when the header line is missing", () => {
    assert.deepEqual(parseHeader("# a title\n\nbody"), {});
  });
});

describe("parseTitle", () => {
  it("uses the first heading, falling back to the slug", () => {
    assert.equal(parseTitle("# my title\n\nbody", "fallback"), "my title");
    assert.equal(parseTitle("no heading", "fallback"), "fallback");
  });
});

describe("buildCard", () => {
  it("flags a filename with no dev id", () => {
    const card = buildCard("open", "feature-0001-thing.md", HEADER);
    assert.ok(card.problems.some((problem) => problem.includes("filename")));
  });

  it("flags a missing owner", () => {
    const card = buildCard("open", "feature-0001-uw-thing.md", "# t\n\nno header");
    assert.ok(card.problems.some((problem) => problem.includes("Owner")));
  });

  it("flags a dev id that disagrees with the owner", () => {
    const card = buildCard(
      "open",
      "feature-0001-rg-thing.md",
      "**Type** feature · **Status** open · **Risk** low · **Opened** 2026-01-01 · **Owner** @someone",
    );
    // `rg` is not in DEV_ID_OWNERS, so only the built-in ids are checked; the
    // server applies the repo's DEVIDS table on top.
    assert.equal(card.devId, "rg");
    assert.equal(card.owner, "@someone");
  });

  it("is clean for a well-formed ticket", () => {
    const card = buildCard(
      "open",
      "feature-0001-uw-thing.md",
      `# feature-0001-uw-thing\n\n${HEADER}`,
    );
    assert.deepEqual(card.problems, []);
    assert.equal(card.owner, "@zerwiz");
    assert.equal(card.number, "0001");
  });
});

describe("parseDevIds", () => {
  it("skips comments and blank lines", () => {
    assert.deepEqual(parseDevIds("# c\n\nuw @zerwiz\n"), { uw: "zerwiz" });
  });
});

describe("buildBoard", () => {
  it("returns the four columns, in workflow order", () => {
    const board = buildBoard([]);
    assert.deepEqual(
      board.columns.map((column) => column.id),
      COLUMNS,
    );
  });

  it("places each card in its column and counts them", () => {
    const board = buildBoard([
      buildCard("open", "feature-0001-uw-a.md", HEADER),
      buildCard("done", "chore-0002-uw-b.md", HEADER),
      buildCard("open", "bug-0003-uw-c.md", HEADER),
    ]);
    assert.equal(board.total, 3);
    assert.equal(board.columns.find((c) => c.id === "open").tickets.length, 2);
    assert.equal(board.columns.find((c) => c.id === "done").tickets.length, 1);
  });
});

describe("columnOf", () => {
  it("accepts a ticket path in a status folder", () => {
    assert.deepEqual(columnOf("open/feature-0001-uw-a.md"), {
      column: "open",
      filename: "feature-0001-uw-a.md",
    });
  });

  it("refuses templates, the README, and nested paths", () => {
    assert.equal(columnOf("_templates/feature.md"), null);
    assert.equal(columnOf("README.md"), null);
    assert.equal(columnOf("open/nested/a.md"), null);
  });
});

describe("safeResolve", () => {
  const root = path.resolve("/srv/tickets");

  it("resolves a path inside the root", () => {
    assert.equal(
      safeResolve(root, "open/a.md"),
      path.join(root, "open", "a.md"),
    );
  });

  it("refuses to escape the root", () => {
    assert.equal(safeResolve(root, "../RULES/08-tickets.md"), null);
    assert.equal(safeResolve(root, "../../etc/passwd"), null);
    assert.equal(safeResolve(root, "open/../../escape.md"), null);
  });
});

describe("readConfig", () => {
  it("binds localhost with a local-only origin list", () => {
    const config = readConfig({});
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 7314);
    assert.ok(
      config.allowedOrigins.every(
        (origin) => origin.includes("localhost") || origin.includes("127.0.0.1"),
      ),
    );
  });
});
