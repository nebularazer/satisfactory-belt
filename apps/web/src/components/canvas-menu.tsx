import { Menu, Monitor, Moon, RotateCcw, Sun } from "lucide-react";

import { useTheme, type Theme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
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
  onResetView: () => void;
};

export function CanvasMenu({ onResetView }: CanvasMenuProps) {
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
          Drag to pan
          <br />
          Scroll to zoom
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
