import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import type { CanvasEditor } from "@/canvas/editor";
import { productionRegions } from "@/canvas/production-regions";
import { MAX_GROUP_NAME_LENGTH } from "@/canvas/group-names";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function GroupInspector({ editor }: { editor: CanvasEditor }) {
  const state = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState,
  );
  const group = state.selectedGroupId
    ? productionRegions(state.document).find(
        (group) => group.id === state.selectedGroupId,
      )
    : undefined;
  if (!group || state.moveDelta) return null;
  return (
    <aside
      aria-label="Group details"
      className="pointer-events-auto absolute right-0 bottom-0 left-0 z-20 rounded-t-2xl border border-border bg-card p-4 text-card-foreground shadow-xl lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:w-80 lg:rounded-xl"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {group.logistics ? "Logistics group" : "Production group"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {group.count} nodes selected
          </p>
        </div>
        <Button
          aria-label="Close group details"
          size="icon"
          variant="ghost"
          onClick={() => editor.dispatch({ type: "selection.clear" })}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <GroupNameForm
        key={`${group.id}:${group.name}`}
        editor={editor}
        group={group}
      />
    </aside>
  );
}
function GroupNameForm({
  editor,
  group,
}: {
  editor: CanvasEditor;
  group: ReturnType<typeof productionRegions>[number];
}) {
  const [name, setName] = useState(group.name);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        editor.dispatch({ type: "group.rename", id: group.id, name });
      }}
    >
      <label className="text-sm font-medium" htmlFor="group-name">
        Group name
      </label>
      <Input
        id="group-name"
        className="mt-1"
        value={name}
        maxLength={MAX_GROUP_NAME_LENGTH}
        onChange={(event) => setName(event.target.value)}
        placeholder={group.defaultName}
      />
      <div className="mt-3 flex gap-2">
        <Button
          type="submit"
          disabled={!name.trim() || name.trim() === group.name}
        >
          Save name
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={group.name === group.defaultName}
          onClick={() =>
            editor.dispatch({ type: "group.rename", id: group.id, name: "" })
          }
        >
          Reset name
        </Button>
      </div>
    </form>
  );
}
