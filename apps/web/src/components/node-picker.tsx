import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import {
  PRODUCTION_MACHINES,
  PRODUCTION_RECIPES,
  productionMachine,
  recipesForMachine,
  type MachineRecipeSelection,
  type ProductionRecipe,
} from "@/game/production-catalog";
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
  onSelect: (selection: MachineRecipeSelection) => void;
  open: boolean;
};

function filterProductionCatalog(
  value: string,
  query: string,
  keywords?: string[],
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return 1;

  const haystack = [value, ...(keywords ?? [])].join(" ").toLocaleLowerCase();
  if (haystack.includes(normalizedQuery)) return 2;

  return normalizedQuery.split(/\s+/).every((term) => haystack.includes(term))
    ? 1
    : 0;
}

export function NodePicker({ onOpenChange, onSelect, open }: NodePickerProps) {
  const [query, setQuery] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
    null,
  );
  const selectedMachine = selectedMachineId
    ? productionMachine(selectedMachineId)
    : undefined;
  const visibleRecipes = selectedMachine
    ? recipesForMachine(selectedMachine.id)
    : PRODUCTION_RECIPES;

  const setOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery("");
      setSelectedMachineId(null);
    }
    onOpenChange(nextOpen);
  };

  const selectRecipe = (recipe: ProductionRecipe, machineId: string) => {
    onSelect({ machineId, recipeId: recipe.id, recipeName: recipe.name });
    setOpen(false);
  };

  return (
    <CommandDialog
      description="Search production machines and their recipes"
      onOpenChange={setOpen}
      open={open}
      title="Add node"
    >
      <Command filter={filterProductionCatalog}>
        {selectedMachine && (
          <div className="flex items-center gap-2 px-2 pt-2">
            <button
              aria-label="Back to all machines and recipes"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setSelectedMachineId(null);
                setQuery("");
              }}
              type="button"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
            </button>
            <img
              alt=""
              aria-hidden="true"
              className="size-8 object-contain"
              src={selectedMachine.imageUrl}
            />
            <div>
              <div className="text-xs font-medium">{selectedMachine.name}</div>
              <div className="text-[0.625rem] text-muted-foreground">
                Select a recipe
              </div>
            </div>
          </div>
        )}
        <CommandInput
          autoFocus
          onValueChange={setQuery}
          placeholder={
            selectedMachine
              ? `Search ${selectedMachine.name} recipes...`
              : "Search machines or recipes..."
          }
          value={query}
        />
        <CommandList>
          <CommandEmpty>No machines or recipes found.</CommandEmpty>
          {!selectedMachine && (
            <CommandGroup heading="Machines">
              {PRODUCTION_MACHINES.map((machine) => {
                const recipeCount = recipesForMachine(machine.id).length;
                return (
                  <CommandItem
                    key={machine.id}
                    keywords={[machine.id]}
                    onSelect={() => {
                      setSelectedMachineId(machine.id);
                      setQuery("");
                    }}
                    value={`machine ${machine.name}`}
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      className="size-9 object-contain"
                      src={machine.imageUrl}
                    />
                    <div className="min-w-0">
                      <div className="font-medium">{machine.name}</div>
                      <div className="text-[0.625rem] text-muted-foreground">
                        {recipeCount} {recipeCount === 1 ? "recipe" : "recipes"}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          <CommandGroup heading="Recipes">
            {visibleRecipes.map((recipe) => {
              const machine =
                selectedMachine ?? productionMachine(recipe.machineIds[0]);
              if (!machine) return null;
              return (
                <CommandItem
                  key={`${machine.id}:${recipe.id}`}
                  keywords={[machine.name, machine.id, recipe.id]}
                  onSelect={() => selectRecipe(recipe, machine.id)}
                  value={`recipe ${recipe.name} ${recipe.id}`}
                >
                  <img
                    alt=""
                    aria-hidden="true"
                    className="size-9 object-contain"
                    src={machine.imageUrl}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{recipe.name}</div>
                    <div className="text-[0.625rem] text-muted-foreground">
                      {machine.name}
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
