import { POWER_GENERATION_PATHS } from "@satisfactory-belt/canvas-pixi/icon-paths";
import { createLucideIcon } from "lucide-react";

// Adapted from Lucide Droplet and Package (ISC): open the right outline for the transfer arrow.
const droplet = "M17 10c-2-1.6-4.5-4.5-5-7-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 12 4.9";
const box = ["M19 9V7l-8-4-8 4v10l8 4 6-3", "m3 7 8 4 8-4", "M11 11v10"];
const arrowIn = ["M22 14h-9", "m16 11-3 3 3 3"];
const arrowOut = ["M13 14h9", "m19 11 3 3-3 3"];
const icon = (name: string, paths: readonly string[]) =>
  createLucideIcon({
    name,
    size: 24,
    node: paths.map((d, index) => ["path", { d, key: String(index) }]),
  });

export const FluidLoadIcon = icon("fluid-load", [droplet, ...arrowIn]);
export const FluidUnloadIcon = icon("fluid-unload", [droplet, ...arrowOut]);
export const FreightLoadIcon = icon("freight-load", [...box, ...arrowIn]);
export const FreightUnloadIcon = icon("freight-unload", [...box, ...arrowOut]);
export const PowerGenerationIcon = icon("power-generation", POWER_GENERATION_PATHS);
