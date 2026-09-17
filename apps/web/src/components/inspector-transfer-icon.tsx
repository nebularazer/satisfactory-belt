import {
  FluidLoadIcon,
  FluidUnloadIcon,
  FreightLoadIcon,
  FreightUnloadIcon,
} from "@/components/inspector-icons";

export function InspectorTransferIcon({
  fluid,
  mode,
}: {
  fluid: boolean;
  mode: "load" | "unload";
}) {
  const Icon = fluid
    ? mode === "load"
      ? FluidLoadIcon
      : FluidUnloadIcon
    : mode === "load"
      ? FreightLoadIcon
      : FreightUnloadIcon;
  return <Icon className="size-4" aria-hidden="true" />;
}
