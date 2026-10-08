import type { FactorySave } from "@satisfactory-belt/factory-saves";
import { EllipsisIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function editedAt(timestamp: number) {
  if (!timestamp) return "Previous autosave";
  const date = new Date(timestamp);
  const today = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `Today, ${time}`;
  return `${date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  })}, ${time}`;
}

export function FactorySaveRow({
  saved,
  selected,
  current,
  disabled,
  canOpen,
  onSelect,
  onOpen,
  onRename,
  onDelete,
  onNavigate,
}: {
  saved: FactorySave;
  selected: boolean;
  current: boolean;
  disabled: boolean;
  canOpen: boolean;
  onSelect: (saved: FactorySave) => void;
  onOpen: (id: string) => void;
  onRename: (saved: FactorySave) => void;
  onDelete: (saved: FactorySave) => void;
  onNavigate: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const select = useCallback(() => onSelect(saved), [onSelect, saved]);
  const open = useCallback(() => {
    if (canOpen && !current && !disabled) onOpen(saved.id);
  }, [canOpen, current, disabled, onOpen, saved]);
  const rename = useCallback(() => onRename(saved), [onRename, saved]);
  const remove = useCallback(() => onDelete(saved), [onDelete, saved]);
  const focusRow = useCallback(
    () => document.getElementById(`factory-row-${saved.id}`),
    [saved.id],
  );
  const menuButton = useMemo(
    () => (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Actions for ${saved.name}`}
        disabled={disabled}
      />
    ),
    [disabled, saved.name],
  );

  return (
    <li
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      className="flex items-center gap-1 rounded-lg border pr-2 not-data-disabled:hover:bg-muted/50 data-selected:border-primary data-selected:bg-muted/50 data-selected:not-data-disabled:hover:bg-muted"
    >
      <button
        id={`factory-row-${saved.id}`}
        type="button"
        data-factory-row={saved.id}
        aria-label={saved.name}
        aria-describedby={current ? `factory-current-${saved.id}` : undefined}
        aria-pressed={selected}
        disabled={disabled}
        onClick={select}
        onDoubleClick={open}
        onKeyDown={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{saved.name}</span>
          <span className="block text-xs text-muted-foreground">{editedAt(saved.updatedAt)}</span>
        </span>
        {current && (
          <span
            id={`factory-current-${saved.id}`}
            className="shrink-0 text-xs text-muted-foreground"
          >
            Current
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger render={menuButton}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36" finalFocus={focusRow}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={rename}>
              <PencilIcon />
              Rename…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={remove}>
              <Trash2Icon />
              Delete…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
