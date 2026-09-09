import { applyResourceNodes } from "./resource-nodes";
import { generateBasicPlan } from "@satisfactory-belt/planning";
import { createNode, findDescriptor } from "@satisfactory-belt/production";
import { basicPlanToCanvasDocument } from "@/canvas/plan-adapters";
import {
  productionRequest,
  type AutoBuildSettings,
} from "./production-request";

export function generateProduction(settings: AutoBuildSettings) {
  const request = productionRequest(settings);
  const generated = generateBasicPlan(request);
  if (generated.solution.status !== "feasible") {
    throw new Error(
      "These outputs cannot be balanced with the selected recipes. Try changing the rates or recipe choices.",
    );
  }
  if (!generated.plan.nodes.length)
    throw new Error(
      "No production machines could be generated for these outputs.",
    );
  const externalOutputs = generated.solution.externalResources.filter(
    (resource) =>
      settings.outputs.some((output) => output.itemId === resource.itemId),
  );
  if (externalOutputs.length)
    throw new Error(
      "A requested output would need to be supplied externally. Choose a recipe that can produce it.",
    );
  // The solver can request clocks below the game's minimum. Do not present a
  // clamped machine allocation as if it met the user's requested output rate.
  const net = new Map<string, number>();
  for (const node of generated.plan.nodes) {
    const materials = createNode(node.configuration).profile.materials;
    if (materials.kind !== "calculated") continue;
    for (const output of materials.outputs)
      net.set(
        output.itemId,
        (net.get(output.itemId) ?? 0) + output.ratePerMinute,
      );
    for (const input of materials.inputs)
      net.set(input.itemId, (net.get(input.itemId) ?? 0) - input.ratePerMinute);
  }
  if (
    request.outputs.some(
      (output) =>
        Math.abs((net.get(output.itemId) ?? 0) - output.ratePerMinute) >
        Math.max(0.0001, output.ratePerMinute * 0.00001),
    )
  ) {
    throw new Error(
      "These rates cannot be met within the machines’ clock limits. Try a higher output rate or another recipe.",
    );
  }
  const document = basicPlanToCanvasDocument(generated.plan);
  return {
    document: settings.resourceNodes
      ? applyResourceNodes(document, settings.resourceNodes)
      : document,
    externalInputs: generated.solution.externalResources.map((resource) => ({
      ...resource,
      name: findDescriptor(resource.itemId)?.name ?? resource.itemId,
    })),
  };
}
