/**
 * A `.excalidraw` scene, built from a plain spec — headlessly.
 *
 * This is the capability a model is not needed for. A scene is just JSON, so an
 * agent can write a real, editable Excalidraw diagram directly: labelled shapes,
 * arrows between them, laid out deterministically.
 *
 * It is deliberately **pure** — no DOM, no canvas, no browser. The one thing that
 * is *not* feasible headlessly is Mermaid conversion: `@excalidraw/mermaid-to-excalidraw`
 * renders Mermaid into the DOM and measures it, so off a browser it yields
 * zero-sized geometry. That is a browser job, and it stays one.
 *
 * Shape and field names mirror the app's own fixtures
 * (`packages/excalidraw/tests/fixtures/elementFixture.ts`).
 */

export const FONT_FAMILY = 1; // Excalifont — the app's default (DEFAULT_FONT_FAMILY)
export const SCENE_VERSION = 2;

const COLORS = {
  stroke: "#1e1e1e",
  fill: "#a5d8ff",
  background: "#ffffff",
};

/** A small deterministic RNG, so two runs produce byte-identical files. */
const makeRandom = (seed = 1) => {
  let state = seed >>> 0 || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
};

const nextId = (random) => {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let index = 0; index < 20; index += 1) {
    out += alphabet[random() % alphabet.length];
  }
  return out;
};

const baseElement = (random, { id, type, x, y, width, height, ...rest }) => ({
  id,
  type,
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor: COLORS.stroke,
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  index: null,
  seed: random(),
  version: 1,
  versionNonce: random(),
  isDeleted: false,
  boundElements: null,
  updated: 1,
  created: 1,
  link: null,
  locked: false,
  ...rest,
});

/** A labelled container: the box has `boundElements`, the text has `containerId`. */
const containerWithLabel = (random, { type, x, y, width, height, label }) => {
  const id = nextId(random);
  const box = baseElement(random, {
    id,
    type,
    x,
    y,
    width,
    height,
    backgroundColor: COLORS.fill,
    ...(type === "diamond" ? { roundness: null } : { roundness: { type: 3 } }),
  });

  if (!label) {
    return { container: box, label: null };
  }

  const textId = nextId(random);
  const fontSize = 20;
  const text = label.length ? label : " ";
  const textWidth = Math.max(width, text.length * fontSize * 0.55);
  const textHeight = fontSize * 1.25;

  box.boundElements = [{ type: "text", id: textId }];

  const textElement = baseElement(random, {
    id: textId,
    type: "text",
    x: x + width / 2 - textWidth / 2,
    y: y + height / 2 - textHeight / 2,
    width: textWidth,
    height: textHeight,
    strokeColor: COLORS.stroke,
    backgroundColor: "transparent",
    strokeWidth: 1,
    fontSize,
    fontFamily: FONT_FAMILY,
    text,
    textAlign: "center",
    verticalAlign: "middle",
    containerId: id,
    originalText: text,
    lineHeight: 1.25,
    roundness: null,
    boundElements: null,
  });

  return { container: box, label: textElement };
};

/** An arrow between two laid-out nodes, drawn edge-to-edge, not centre-to-centre. */
const arrowBetween = (random, from, to) => {
  const id = nextId(random);
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const endY = to.y + to.height / 2;
  return baseElement(random, {
    id,
    type: "arrow",
    x: startX,
    y: startY,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
    points: [
      [0, 0],
      [endX - startX, endY - startY],
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
    roundness: { type: 2 },
    elbowed: false,
  });
};

/**
 * Lays a node graph out on a grid and returns the elements.
 *
 * Layout is deliberately simple and **deterministic**: nodes fill a grid of
 * `columns` (default: square-ish), spaced generously enough that arrows are
 * readable. Making it prettier is a graph-layout problem, not a scene problem.
 */
export const buildElements = (spec, { seed = 1, columns } = {}) => {
  const random = makeRandom(seed);
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes : [];
  if (!nodes.length) {
    return { elements: [], index: new Map() };
  }

  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 80;
  const GAP_X = 120;
  const GAP_Y = 110;
  const gridColumns =
    Number.isFinite(columns) && columns > 0
      ? columns
      : Math.max(1, Math.ceil(Math.sqrt(nodes.length)));

  const elements = [];
  const index = new Map();

  nodes.forEach((node, position) => {
    const column = position % gridColumns;
    const row = Math.floor(position / gridColumns);
    const x = 100 + column * (NODE_WIDTH + GAP_X);
    const y = 100 + row * (NODE_HEIGHT + GAP_Y);
    const { container, label } = containerWithLabel(random, {
      type: node.shape ?? "rectangle",
      x,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      label: node.label ?? node.id,
    });
    elements.push(container);
    if (label) {
      elements.push(label);
    }
    index.set(node.id, container);
  });

  for (const edge of Array.isArray(spec?.edges) ? spec.edges : []) {
    const from = index.get(edge.from);
    const to = index.get(edge.to);
    if (!from || !to) {
      continue; // an edge to a node that does not exist is dropped, not invented
    }
    elements.push(arrowBetween(random, from, to));
  }

  return { elements, index };
};

/**
 * The complete file. `appState` is intentionally minimal — the app fills the
 * rest on open, and a minimal appState travels better than a stale one.
 */
export const buildScene = (spec, options = {}) => {
  const { elements } = buildElements(spec, options);
  const random = makeRandom((options.seed ?? 1) + 7);
  return {
    type: "excalidraw",
    version: SCENE_VERSION,
    source: "ymir",
    elements,
    appState: {
      gridSize: null,
      viewBackgroundColor: COLORS.background,
      ...(spec?.title ? {} : {}),
    },
    files: {},
    // A title is written as a text element rather than appState, so it survives
    // every exporter.
    ...(spec?.title
      ? {
          elements: [
            {
              ...baseElement(random, {
                id: nextId(random),
                type: "text",
                x: 100,
                y: 20,
                width: Math.max(200, spec.title.length * 11),
                height: 30,
                fontSize: 28,
                fontFamily: FONT_FAMILY,
                text: spec.title,
                textAlign: "left",
                verticalAlign: "top",
                containerId: null,
                originalText: spec.title,
                lineHeight: 1.25,
                strokeWidth: 1,
              }),
            },
            ...elements,
          ],
        }
      : {}),
  };
};

/** A human-readable summary — what an agent should read back, not the JSON. */
export const describeScene = (scene) => {
  const elements = Array.isArray(scene?.elements) ? scene.elements : [];
  const byType = elements.reduce((acc, element) => {
    acc[element.type] = (acc[element.type] ?? 0) + 1;
    return acc;
  }, {});
  const labels = elements
    .filter((element) => element.type === "text")
    .map((element) => element.text);
  return {
    elements: elements.length,
    byType,
    labels,
  };
};
