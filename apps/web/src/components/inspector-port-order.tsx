/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Local inspector controls. */
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import type { createFactoryEditor } from "@/lib/factory-editor";

export function InspectorPortOrder({
  editor,
  nodeId,
  portKey,
  label,
  index,
  count,
}: {
  editor: ReturnType<typeof createFactoryEditor>;
  nodeId: string;
  portKey: string;
  label: string;
  index: number;
  count: number;
}) {
  if (count < 2) return null;
  return (
    <ButtonGroup aria-label={`${label} order`} className="shrink-0">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => editor.movePort(nodeId, portKey, -1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => editor.movePort(nodeId, portKey, 1)}
      >
        <ArrowDownIcon />
      </Button>
    </ButtonGroup>
  );
}
