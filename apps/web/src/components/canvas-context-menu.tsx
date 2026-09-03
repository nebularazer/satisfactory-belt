import type { ReactNode } from "react";
import { CopyPlus, Plus, Trash2 } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type CanvasContextMenuProps = {
  children: ReactNode;
  hasNodeTarget: boolean;
  onAddNode: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function CanvasContextMenu({
  children,
  hasNodeTarget,
  onAddNode,
  onContextMenu,
  onDelete,
  onDuplicate,
}: CanvasContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block h-full w-full"
        onContextMenu={onContextMenu}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {hasNodeTarget ? (
          <>
            <ContextMenuItem onClick={onDuplicate}>
              <CopyPlus aria-hidden="true" />
              Duplicate selection
              <ContextMenuShortcut>⌘/Ctrl D</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={onDelete} variant="destructive">
              <Trash2 aria-hidden="true" />
              Delete selection
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem onClick={onAddNode}>
            <Plus aria-hidden="true" />
            Add node here
            <ContextMenuShortcut>N</ContextMenuShortcut>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
