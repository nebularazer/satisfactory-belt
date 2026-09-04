import type { ReactNode } from "react";
import { CopyPlus, Trash2 } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type CanvasContextMenuProps = {
  children: ReactNode;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => boolean;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function CanvasContextMenu({
  children,
  onContextMenu,
  onDelete,
  onDuplicate,
}: CanvasContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="block h-full w-full"
        onContextMenu={(event) => {
          if (onContextMenu(event)) return;
          event.preventDefault();
          event.preventBaseUIHandler();
        }}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
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
      </ContextMenuContent>
    </ContextMenu>
  );
}
