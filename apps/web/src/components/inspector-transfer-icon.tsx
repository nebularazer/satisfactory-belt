import { WavesArrowDownIcon, WavesArrowUpIcon, PackageIcon, PackageOpenIcon } from "lucide-react";

export function InspectorTransferIcon({
  fluid,
  mode,
}: {
  fluid: boolean;
  mode: "load" | "unload";
}) {
  const Icon = fluid
    ? mode === "load"
      ? WavesArrowDownIcon
      : WavesArrowUpIcon
    : mode === "load"
      ? PackageIcon
      : PackageOpenIcon;
  return <Icon className="size-4" aria-hidden="true" />;
}
