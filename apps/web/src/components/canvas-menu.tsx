import {
  CopyPlus,
  Download,
  FileX2,
  FolderOpen,
  Focus,
  Gauge,
  Grid3X3,
  Magnet,
  Maximize2,
  Menu,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Save,
  SaveAll,
  Sun,
  Trash2,
  Upload,
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
  activeSaveName?: string;
  canDelete: boolean;
  canDuplicate: boolean;
  canFitAll: boolean;
  canFitSelection: boolean;
  canResetCanvas: boolean;
  onAddNode: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onFitAll: () => void;
  onFitSelection: () => void;
  onImport: () => void;
  onManagePlans: () => void;
  onResetCanvas: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onShowGridDotsChange: (enabled: boolean) => void;
  onShowPerformanceChange: (enabled: boolean) => void;
  onResetView: () => void;
  onSnapToGridChange: (enabled: boolean) => void;
  showGridDots: boolean;
  showPerformance: boolean;
  snapToGrid: boolean;
};

export function CanvasMenu({
  activeSaveName,
  canDelete,
  canDuplicate,
  canFitAll,
  canFitSelection,
  canResetCanvas,
  onAddNode,
  onDelete,
  onDuplicate,
  onExport,
  onFitAll,
  onFitSelection,
  onImport,
  onManagePlans,
  onResetCanvas,
  onSave,
  onSaveAs,
  onShowGridDotsChange,
  onShowPerformanceChange,
  onResetView,
  onSnapToGridChange,
  showGridDots,
  showPerformance,
  snapToGrid,
}: CanvasMenuProps) {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Open canvas menu"
            className="size-9 bg-card shadow-sm hover:bg-muted dark:bg-card dark:hover:bg-muted"
            size="icon-lg"
            variant="outline"
          />
        }
      >
        <Menu aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[calc(100dvh-5rem)] w-60 overflow-y-auto"
        sideOffset={8}
      >
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
          <DropdownMenuItem onClick={onResetView}>
            <RotateCcw aria-hidden="true" />
            Reset view
            <DropdownMenuShortcut>0</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canFitAll} onClick={onFitAll}>
            <Maximize2 aria-hidden="true" />
            Fit all
            <DropdownMenuShortcut>1</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canFitSelection}
            onClick={onFitSelection}
          >
            <Focus aria-hidden="true" />
            Fit selection
            <DropdownMenuShortcut>2</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-3">
            <span>Document</span>
            {activeSaveName && (
              <span
                className="max-w-32 truncate font-normal text-muted-foreground"
                title={activeSaveName}
              >
                {activeSaveName}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={onSave}>
            <Save aria-hidden="true" />
            Save
            <DropdownMenuShortcut>⌘/Ctrl S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSaveAs}>
            <SaveAll aria-hidden="true" />
            Save as…
            <DropdownMenuShortcut>⌘/Ctrl ⇧S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onManagePlans}>
            <FolderOpen aria-hidden="true" />
            Manage plans…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onImport}>
            <Upload aria-hidden="true" />
            Import JSON
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canFitAll} onClick={onExport}>
            <Download aria-hidden="true" />
            Export JSON
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canResetCanvas}
            onClick={onResetCanvas}
            variant="destructive"
          >
            <FileX2 aria-hidden="true" />
            Reset canvas
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Settings</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={snapToGrid}
            onCheckedChange={onSnapToGridChange}
          >
            <Magnet aria-hidden="true" />
            Snap to grid
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showGridDots}
            onCheckedChange={onShowGridDotsChange}
          >
            <Grid3X3 aria-hidden="true" />
            Show grid dots
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showPerformance}
            onCheckedChange={onShowPerformanceChange}
          >
            <Gauge aria-hidden="true" />
            Performance metrics
          </DropdownMenuCheckboxItem>
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
          Drag empty space to pan · Scroll to zoom
          <br />
          Click a node to select · Drag it to move
          <br />
          Ctrl/Cmd + click toggles selection
          <br />
          Ctrl/Cmd + drag creates a selection box
          <br />
          Arrow keys move selected nodes · 1/2 fits content
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
