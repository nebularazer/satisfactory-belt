import { createFactoryStore } from "@satisfactory-belt/factory-saves";

export type { FactoryStore as PlanStore } from "@satisfactory-belt/factory-saves";

export function createBrowserPlanStore(
  factory: IDBFactory = window.indexedDB,
  baseUrl: string = import.meta.env.BASE_URL,
) {
  return createFactoryStore(factory, `satisfactory-belt:${baseUrl}`);
}
