import { expect, it } from "vitest";
import { generateProduction } from "./generate-production";
import {
  attachProductionRequest,
  parseProductionSections,
  prepareProductionReplacement,
} from "./production-sections";
import { EMPTY_CANVAS_DOCUMENT } from "@/canvas/document";
import { prepareProductionInsertion } from "@/canvas/insert-production";
import { createCanvasEditor } from "@/canvas/editor";
import { parseCanvasDocument } from "@/canvas/document-format";

const settings = {
  outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 10 }],
  resourceNodes: [
    {
      itemId: "Desc_OreIron_C",
      buildableId: "Build_MinerMk1_C",
      impure: 0,
      normal: 8,
      pure: 0,
      maximumClockPercent: 100,
    },
  ],
  allowedAlternateIds: ["Recipe_Alternate_Screw_C"],
  pinnedRecipes: { Desc_IronScrew_C: "Recipe_Alternate_Screw_C" },
};
const build = () =>
  attachProductionRequest(
    prepareProductionInsertion(
      EMPTY_CANVAS_DOCUMENT,
      generateProduction(settings).document,
      "first",
    ),
    "first",
    settings,
  );

it("saves independent requests with insertion and restores them with undo/redo", () => {
  const editor = createCanvasEditor();
  const first = build();
  editor.dispatch({
    type: "document.insert",
    source: editor.getState().document,
    document: first,
  });
  const second = attachProductionRequest(
    prepareProductionInsertion(
      first,
      generateProduction(settings).document,
      "second",
    ),
    "second",
    settings,
  );
  editor.dispatch({
    type: "document.insert",
    source: editor.getState().document,
    document: second,
  });
  const both = editor.getState().document;
  expect(both.productionSections).toHaveLength(2);
  expect(parseCanvasDocument(JSON.stringify(both))).toEqual(both);
  editor.dispatch({ type: "history.undo" });
  expect(editor.getState().document).toEqual(first);
  editor.dispatch({ type: "history.undo" });
  expect(editor.getState().document).toEqual(EMPTY_CANVAS_DOCUMENT);
  editor.dispatch({ type: "history.redo" });
  editor.dispatch({ type: "history.redo" });
  expect(editor.getState().document).toEqual(both);
});

it("replaces only recorded members, preserves compatible boundary links, and restores manual edits and settings atomically", () => {
  const first = build();
  const other = attachProductionRequest(
    prepareProductionInsertion(
      first,
      generateProduction(settings).document,
      "second",
    ),
    "second",
    settings,
  );
  const output = first.nodes.find(
    (n) =>
      n.configuration.kind === "process" &&
      n.configuration.processId === "Recipe_ModularFrame_C",
  )!;
  const target = other.nodes.find(
    (n) =>
      n.configuration.kind === "process" &&
      n.configuration.processId === "Recipe_ModularFrame_C",
  )!;
  // A manually added consumer of rods outside the generated section.
  const rod = first.nodes.find(
    (n) =>
      n.configuration.kind === "process" &&
      n.configuration.processId === "Recipe_IronRod_C",
  )!;
  const boundary = {
    id: first.materialLinks.find((l) => l.from.nodeId === rod.configuration.id)!
      .id,
    from: { nodeId: rod.configuration.id, portId: "output:Desc_IronRod_C" },
    to: { nodeId: target.configuration.id, portId: "input:Desc_IronRod_C" },
    route: [
      { x: 1, y: 2 },
      { x: 3, y: 2 },
    ],
  };
  const source = {
    ...first,
    nodes: [
      ...first.nodes.map((n) =>
        n === output ? { ...n, label: "My edited frame group", x: 1900 } : n,
      ),
      ...other.nodes,
    ],
    materialLinks: [...first.materialLinks, ...other.materialLinks, boundary],
    productionSections: [
      ...first.productionSections!,
      ...other.productionSections!,
    ],
  };
  const nextSettings = {
    ...settings,
    outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: 20 }],
  };
  const replacement = prepareProductionReplacement(
    source,
    first.productionSections![0]!,
    generateProduction(nextSettings).document,
    nextSettings,
  );
  expect(replacement.disconnected).toEqual([]);
  expect(replacement.retained).toHaveLength(1);
  expect(replacement.retained[0]!.id).toBe(boundary.id);
  expect(
    new Set(replacement.document.materialLinks.map((l) => l.id)).size,
  ).toBe(replacement.document.materialLinks.length);
  expect(replacement.retained[0]?.route).toBeUndefined();
  expect(
    replacement.document.nodes.filter((n) => other.nodes.includes(n)),
  ).toEqual(other.nodes);
  expect(replacement.document.productionSections![1]).toEqual(
    other.productionSections![0],
  );
  const editor = createCanvasEditor({ document: source });
  editor.dispatch({
    type: "production.replace",
    source,
    document: replacement.document,
    sectionId: "first",
  });
  expect(editor.getState().document).toEqual(replacement.document);
  expect(editor.getState().document.productionSections![0]!.settings).toEqual(
    nextSettings,
  );
  editor.dispatch({ type: "history.undo" });
  expect(editor.getState().document).toEqual(source);
  editor.dispatch({ type: "history.redo" });
  expect(editor.getState().document).toEqual(replacement.document);
  expect(
    parseCanvasDocument(JSON.stringify(editor.getState().document)),
  ).toEqual(replacement.document);
  // A stale preview cannot overwrite an edit.
  editor.dispatch({
    type: "production.replace",
    source,
    document: source,
    sectionId: "first",
  });
  expect(editor.getState().document).toEqual(replacement.document);
});

it("reports unmatched external links instead of silently reconnecting reused sequence IDs", () => {
  const source = build();
  const rod = source.nodes.find(
    (n) =>
      n.configuration.kind === "process" &&
      n.configuration.processId === "Recipe_IronRod_C",
  )!;
  const consumer = source.nodes.find(
    (n) =>
      n.configuration.kind === "process" &&
      n.configuration.processId === "Recipe_ModularFrame_C",
  )!;
  const outside = {
    ...consumer,
    configuration: { ...consumer.configuration, id: "outside" },
  };
  const link = {
    id: "external",
    from: { nodeId: rod.configuration.id, portId: "output:Desc_IronRod_C" },
    to: { nodeId: "outside", portId: "input:Desc_IronRod_C" },
  };
  const next = {
    outputs: [{ itemId: "Desc_IronPlate_C", ratePerMinute: 20 }],
    allowedAlternateIds: [],
    pinnedRecipes: {},
  };
  const result = prepareProductionReplacement(
    {
      ...source,
      nodes: [...source.nodes, outside],
      materialLinks: [...source.materialLinks, link],
    },
    source.productionSections![0]!,
    generateProduction(next).document,
    next,
  );
  expect(result.disconnected).toEqual([link]);
  expect(result.retained).toEqual([]);
  expect(result.document.nodes).toContain(outside);
  expect(result.document.materialLinks).not.toContain(link);
});

it("validates saved requests, allows older plans, and rejects overlapping section ownership", () => {
  expect(parseCanvasDocument(JSON.stringify(EMPTY_CANVAS_DOCUMENT))).toEqual(
    EMPTY_CANVAS_DOCUMENT,
  );
  const section = build().productionSections![0]!;
  expect(parseProductionSections([section])).toEqual([section]);
  expect(() =>
    parseProductionSections([section, { ...section, id: "other" }]),
  ).toThrow("multiple");
  expect(() =>
    parseProductionSections([
      {
        ...section,
        settings: {
          ...settings,
          outputs: [{ itemId: "Desc_ModularFrame_C", ratePerMinute: -1 }],
        },
      },
    ]),
  ).toThrow();
  expect(() =>
    parseProductionSections([
      { ...section, settings: { ...settings, resourceNodes: [null] } },
    ]),
  ).toThrow();
});
