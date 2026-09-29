import type { CanvasSnapshot, PortReference } from "@satisfactory-belt/canvas-core";

import type { createFactoryEditor } from "./factory-editor";

type Editor = ReturnType<typeof createFactoryEditor>;

/** A primitive snapshot stays equal during camera, hover, and drag updates. */
export function inspectorTarget({
  selection,
  linkSelection,
  ports,
}: Pick<CanvasSnapshot, "selection" | "linkSelection" | "ports">): string | null {
  if (ports.anchor) return `port:${JSON.stringify(ports.anchor)}`;
  if (selection.size > 1) return null;
  if (selection.size === 1) return `node:${selection.values().next().value!}`;
  return linkSelection.selected ? `link:${linkSelection.selected}` : null;
}

export function inspectorSummary(
  editor: Pick<Editor, "getDisplay" | "getLink">,
  target: string | null,
) {
  if (!target) return null;
  const ref = inspectorPort(target);
  if (ref) {
    const display = editor.getDisplay(ref.nodeId);
    const port = display?.ports.find((entry) => entry.key === ref.portKey);
    return display && port
      ? {
          title: `${port.name} · ${port.direction === "input" ? "Input" : "Output"}`,
          subtitle: display.title,
          deleteLabel: null,
        }
      : null;
  }
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

export function inspectorPort(target: string | null): PortReference | null {
  if (!target?.startsWith("port:")) return null;
  const ref: unknown = JSON.parse(target.slice(5));
  return ref &&
    typeof ref === "object" &&
    "nodeId" in ref &&
    typeof ref.nodeId === "string" &&
    "portKey" in ref &&
    typeof ref.portKey === "string"
    ? { nodeId: ref.nodeId, portKey: ref.portKey }
    : null;
}

export function portConnections(
  editor: Pick<Editor, "history" | "getDisplay" | "getFlowAnalysis">,
  ref: PortReference,
) {
  const analysis = editor.getFlowAnalysis();
  return editor.history.getSnapshot().state.links.flatMap((link) => {
    const output = link.output.nodeId === ref.nodeId && link.output.portKey === ref.portKey;
    const input = link.input.nodeId === ref.nodeId && link.input.portKey === ref.portKey;
    if (!output && !input) return [];
    const other = output ? link.input : link.output;
    const display = editor.getDisplay(other.nodeId);
    return display ? [{ id: link.id, display, rates: analysis.links.get(link.id) ?? [] }] : [];
  });
}
