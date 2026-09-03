import { Square } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type NodePickerProps = {
  onOpenChange: (open: boolean) => void;
  onSelect: () => void;
  open: boolean;
};

export function NodePicker({ onOpenChange, onSelect, open }: NodePickerProps) {
  return (
    <CommandDialog
      description="Search the available canvas node types"
      onOpenChange={onOpenChange}
      open={open}
      overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
      title="Add node"
    >
      <Command>
        <CommandInput autoFocus placeholder="Search nodes..." />
        <CommandList>
          <CommandEmpty>No nodes found.</CommandEmpty>
          <CommandGroup heading="Available nodes">
            <CommandItem
              onSelect={() => {
                onSelect();
                onOpenChange(false);
              }}
              value="node"
            >
              <Square aria-hidden="true" />
              Node
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
