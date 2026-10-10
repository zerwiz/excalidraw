import React from "react";
import { beforeEach, describe, expect, it } from "vitest";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { serializeAsJSON } from "../data/json";
import { restoreAppState, restoreElements } from "../data/restore";

// The generator lives in the repo's Node-side `server/` tree. Importing it here
// is the point of this test: a scene it writes must survive the app's OWN
// restore path, which is the only validator that counts. The module is plain
// `.mjs` (no types), so its output is narrowed once, here, rather than
// everywhere below.
import { Excalidraw } from "../index";

import { buildScene, describeScene } from "../../../server/diagram/scene.mjs";

import { render, unmountComponent } from "./test-utils";

import type { AppState, BinaryFiles } from "../types";

type BuiltScene = {
  type: string;
  version: number;
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

const makeScene = (spec: unknown): BuiltScene =>
  buildScene(spec) as unknown as BuiltScene;

const spec = {
  title: "Request flow",
  nodes: [
    { id: "client", label: "Client" },
    { id: "edge", label: "Edge", shape: "diamond" },
    { id: "api", label: "API", shape: "ellipse" },
    { id: "db", label: "Database" },
  ],
  edges: [
    { from: "client", to: "edge" },
    { from: "edge", to: "api" },
    { from: "api", to: "db" },
  ],
};

const SHAPES = ["rectangle", "ellipse", "diamond"];

describe("a scene built from a spec, headlessly", () => {
  it("is a well-formed .excalidraw file", () => {
    const scene = makeScene(spec);
    expect(scene.type).toBe("excalidraw");
    expect(scene.version).toBe(2);
    expect(Array.isArray(scene.elements)).toBe(true);
    expect(scene.files).toEqual({});
  });

  it("survives the app's OWN restore path — every element is accepted", () => {
    const scene = makeScene(spec);
    const restored = restoreElements(scene.elements, null);
    expect(restored).toHaveLength(scene.elements.length);

    for (const element of restored) {
      expect(typeof element.type).toBe("string");
      expect(Number.isFinite(element.x)).toBe(true);
      expect(Number.isFinite(element.y)).toBe(true);
      expect(Number.isFinite(element.width)).toBe(true);
      expect(Number.isFinite(element.height)).toBe(true);
    }

    // SHAPES must have real size in both axes. ARROWS need only one: a
    // horizontal arrow legitimately has height 0, a vertical one width 0.
    // TEXT is excluded entirely — `restoreElements` re-measures text through the
    // DOM, and jsdom measures nothing, so a text element collapses to 0 here and
    // only here. The file is not wrong; the measuring environment is absent.
    const shapes = restored.filter((element) => SHAPES.includes(element.type));
    for (const element of shapes) {
      expect(element.width, `${element.type} width`).toBeGreaterThan(0);
      expect(element.height, `${element.type} height`).toBeGreaterThan(0);
    }

    const arrows = restored.filter((element) => element.type === "arrow");
    for (const arrow of arrows) {
      expect(
        arrow.width > 0 || arrow.height > 0,
        "an arrow must span at least one axis",
      ).toBe(true);
    }

    expect(shapes.length).toBeGreaterThan(0);
    expect(arrows.length).toBeGreaterThan(0);

    // and appState restores without throwing
    const appState = restoreAppState(scene.appState, null);
    expect(appState.viewBackgroundColor).toBe("#ffffff");
  });

  it("produces labelled shapes: a container bound to its text", () => {
    const scene = makeScene(spec);
    const restored = restoreElements(scene.elements, null);

    const boxes = restored.filter((element) => SHAPES.includes(element.type));
    const texts = restored.filter((element) => element.type === "text");

    expect(boxes).toHaveLength(4);
    // 4 shape labels + the title
    expect(texts).toHaveLength(5);

    for (const box of boxes) {
      const bound = box.boundElements ?? [];
      expect(bound).toHaveLength(1);
      const reference = bound[0];
      expect(reference.type).toBe("text");
      const label = restored.find((element) => element.id === reference.id);
      expect(label, `no text element bound to ${box.type}`).toBeDefined();
      expect(label && "containerId" in label ? label.containerId : null).toBe(
        box.id,
      );
    }
  });

  it("draws one arrow per edge, and drops an edge to a node that does not exist", () => {
    const scene = makeScene(spec);
    const arrows = scene.elements.filter((element) => element.type === "arrow");
    expect(arrows).toHaveLength(3);
    for (const arrow of arrows) {
      expect("endArrowhead" in arrow ? arrow.endArrowhead : null).toBe("arrow");
      expect("points" in arrow ? (arrow.points as unknown[]).length : 0).toBe(
        2,
      );
    }

    const withGhost = makeScene({
      nodes: [{ id: "a" }],
      edges: [{ from: "a", to: "ghost" }],
    });
    expect(
      withGhost.elements.filter((element) => element.type === "arrow"),
    ).toHaveLength(0);
  });

  it("round-trips through serializeAsJSON and back", () => {
    const scene = makeScene(spec);
    const json = serializeAsJSON(
      scene.elements,
      scene.appState,
      scene.files,
      "local",
    );
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe("excalidraw");
    const restored = restoreElements(parsed.elements, null);
    expect(restored).toHaveLength(scene.elements.length);
  });

  it("is deterministic: the same spec twice is byte-identical", () => {
    const first = JSON.stringify(makeScene(spec));
    const second = JSON.stringify(makeScene(spec));
    expect(first).toBe(second);
  });

  it("describes itself in words, which is what an agent should read back", () => {
    const summary = describeScene(makeScene(spec)) as {
      elements: number;
      byType: Record<string, number>;
      labels: string[];
    };
    expect(summary.elements).toBeGreaterThan(0);
    expect(summary.byType.arrow).toBe(3);
    expect(summary.labels).toContain("Client");
    expect(summary.labels).toContain("Database");
  });

  it("handles an empty spec without inventing anything", () => {
    const scene = makeScene({ nodes: [] });
    expect(scene.elements).toEqual([]);
    expect((describeScene(scene) as { elements: number }).elements).toBe(0);
  });
});

describe("the app itself holds a generated scene", () => {
  beforeEach(() => {
    unmountComponent();
    localStorage.clear();
  });

  it("mounts with initialData and keeps every element", async () => {
    const scene = makeScene(spec);
    await render(
      <Excalidraw
        initialData={{
          elements: scene.elements,
          appState: scene.appState,
          scrollToContent: true,
        }}
      />,
    );

    // `window.h` is the live scene the app is holding.
    const live = window.h.elements;
    // Text may be re-measured (jsdom measures nothing), but nothing may be
    // silently dropped on the way in.
    expect(live.length).toBe(scene.elements.length);

    const types = live.map((element) => element.type);
    expect(types.filter((type) => type === "arrow")).toHaveLength(3);
    expect(types.filter((type) => type === "rectangle")).toHaveLength(2);
    expect(types.filter((type) => type === "diamond")).toHaveLength(1);
    expect(types.filter((type) => type === "ellipse")).toHaveLength(1);
    expect(types.filter((type) => type === "text")).toHaveLength(5);
  });
});
