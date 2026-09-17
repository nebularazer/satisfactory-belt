import type { CanvasSnapshot } from "@satisfactory-belt/canvas-core";

import type { createFactoryEditor } from "./factory-editor";

type Editor = ReturnType<typeof createFactoryEditor>;

/** A primitive snapshot stays equal during camera, hover, and drag updates. */
export function inspectorTarget({
  selection,
  linkSelection,
}: Pick<CanvasSnapshot, "selection" | "linkSelection">): string | null {
  if (selection.size > 1) return null;
  if (selection.size === 1) return `node:${selection.values().next().value!}`;
  return linkSelection.selected ? `link:${linkSelection.selected}` : null;
}

export function inspectorSummary(
  editor: Pick<Editor, "getDisplay" | "getLink">,
  target: string | null,
) {
  if (!target) return null;
  const id = target.slice(5);
  if (target.startsWith("node:")) {
    const display = editor.getDisplay(id);
    return display
      ? {
          title: display.title,
          subtitle: display.layout === "machine" ? display.subtitle : "Logistics node",
          deleteLabel: "Delete node",
        }
      : null;
  }
  const link = editor.getLink(id);
  if (!link) return null;
  const source = editor.getDisplay(link.output.nodeId);
  const destination = editor.getDisplay(link.input.nodeId);
  const output = source?.ports.find((port) => port.key === link.output.portKey);
  const input = destination?.ports.find((port) => port.key === link.input.portKey);
  if (!source || !destination || !output || !input) return null;
  return {
    title:
      output.transport === "pipe"
        ? "Pipeline"
        : output.transport.endsWith("-route")
          ? "Transport route"
          : "Conveyor",
    subtitle: null,
    deleteLabel: "Delete link",
  };
}
