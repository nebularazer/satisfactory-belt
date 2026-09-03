import {
  CopyPlus,
  Magnet,
  Menu,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
} from "lucide-react";

import { useTheme, type Theme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type CanvasMenuProps = {
  canDelete: boolean;
  canDuplicate: boolean;
  onAddNode: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onResetView: () => void;
  onSnapToGridChange: (enabled: boolean) => void;
  snapToGrid: boolean;
};

export function CanvasMenu({
  canDelete,
  canDuplicate,
  onAddNode,
  onDelete,
  onDuplicate,
  onResetView,
  onSnapToGridChange,
  snapToGrid,
}: CanvasMenuProps) {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Open canvas menu"
            className="size-9 bg-card/95 shadow-sm"
            size="icon-lg"
            variant="outline"
          />
        }
      >
        <Menu aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" sideOffset={8}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Canvas</DropdownMenuLabel>
          <DropdownMenuItem onClick={onAddNode}>
            <Plus aria-hidden="true" />
            Add node
            <DropdownMenuShortcut>N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canDuplicate} onClick={onDuplicate}>
            <CopyPlus aria-hidden="true" />
            Duplicate selection
            <DropdownMenuShortcut>⌘/Ctrl D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canDelete}
            onClick={onDelete}
            variant="destructive"
          >
            <Trash2 aria-hidden="true" />
            Delete selection
            <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={snapToGrid}
            onCheckedChange={onSnapToGridChange}
          >
            <Magnet aria-hidden="true" />
            Snap to grid
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onClick={onResetView}>
            <RotateCcw aria-hidden="true" />
            Reset view
            <DropdownMenuShortcut>0</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => setTheme(value as Theme)}
            value={theme}
          >
            <DropdownMenuRadioItem value="dark">
              <Moon aria-hidden="true" />
              Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor aria-hidden="true" />
              System
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <Sun aria-hidden="true" />
              Light
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs leading-5 text-muted-foreground">
          Drag to pan · Scroll to zoom
          <br />
          Ctrl/Cmd + click or drag to select
          <br />
          Ctrl/Cmd + drag a node to move it
          <br />
          Shift adds · Alt bypasses snap
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
