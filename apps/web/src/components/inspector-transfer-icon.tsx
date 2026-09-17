import { ArrowDownToLineIcon, ArrowUpFromLineIcon, DropletIcon, PackageIcon } from "lucide-react";

export function InspectorTransferIcon({
  fluid,
  mode,
}: {
  fluid: boolean;
  mode: "load" | "unload";
}) {
  return (
    <span className="flex items-center" aria-hidden="true">
      {fluid ? <DropletIcon className="size-4" /> : <PackageIcon className="size-4" />}
      {mode === "load" ? (
        <ArrowDownToLineIcon className="size-3" />
      ) : (
        <ArrowUpFromLineIcon className="size-3" />
      )}
    </span>
  );
}
