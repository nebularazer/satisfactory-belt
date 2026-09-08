import type { CanvasEditorState } from "./editor";

export const MUTED_CANVAS_ALPHA = 0.25;

export type SelectionFocus = Readonly<{
  nodeIds: ReadonlySet<string>;
  linkIds: ReadonlySet<string>;
}>;

/** Only expand from the selection, never from its newly discovered neighbors. */
export function selectionFocus(
  state: Pick<
    CanvasEditorState,
    "document" | "selectedIds" | "selectedLinkIds" | "connectionPreview"
  >,
): SelectionFocus | undefined {
  if (
    state.connectionPreview ||
    (!state.selectedIds.length && !state.selectedLinkIds.length)
  )
    return undefined;

  // Group selection already supplies all member IDs through selectedIds.
  const selectedNodes = new Set(state.selectedIds);
  const nodeIds = new Set(selectedNodes);
  const linkIds = new Set(state.selectedLinkIds);
  for (const link of state.document.materialLinks) {
    if (
      linkIds.has(link.id) ||
      selectedNodes.has(link.from.nodeId) ||
      selectedNodes.has(link.to.nodeId)
    ) {
      linkIds.add(link.id);
      nodeIds.add(link.from.nodeId);
      nodeIds.add(link.to.nodeId);
    }
  }
  return { nodeIds, linkIds };
}
