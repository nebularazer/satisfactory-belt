import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Menu, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type CanvasMenuProps = {
  onResetView: () => void;
};

export function CanvasMenu({ onResetView }: CanvasMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button aria-label="Open canvas menu" size="icon" variant="outline">
          <Menu aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="z-50 min-w-56 rounded-xl border border-border bg-card p-1.5 text-foreground shadow-lg"
          sideOffset={8}
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Canvas
          </DropdownMenu.Label>
          <DropdownMenu.Item
            className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-2 text-sm outline-none hover:bg-accent focus:bg-accent"
            onSelect={onResetView}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset view
            <span className="ml-auto text-xs text-muted-foreground">0</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <div className="px-2 py-1.5 text-xs leading-5 text-muted-foreground">
            Drag to pan
            <br />
            Ctrl/Cmd + scroll to zoom
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
