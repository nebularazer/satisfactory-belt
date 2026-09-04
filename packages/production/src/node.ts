import { createMaterialNode } from "./material-node";
import { createProcessNode } from "./process-node";
import type {
  Node,
  NodeConfiguration,
  NodeRequest,
  ProcessInstanceRequest,
  ResourcePurity,
} from "./types";

export class NodeConfigurationError extends Error {
  override readonly name = "NodeConfigurationError";
}

function invalid(message: string): never {
  throw new NodeConfigurationError(message);
}

function configurationFailure(error: unknown): never {
  if (error instanceof NodeConfigurationError) throw error;
  throw new NodeConfigurationError(
    error instanceof Error ? error.message : "Invalid Node configuration.",
    { cause: error },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(
  record: Record<string, unknown>,
  property: string,
): string {
  const value = record[property];
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${property} must be a non-empty string.`);
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  property: string,
): string | undefined {
  const value = record[property];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${property} must be a non-empty string when provided.`);
  }
  return value;
}

function optionalNumber(
  record: Record<string, unknown>,
  property: string,
): number | undefined {
  const value = record[property];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(`${property} must be a finite number when provided.`);
  }
  return value;
}

function optionalPurity(
  record: Record<string, unknown>,
  property: string,
): ResourcePurity | undefined {
  const value = record[property];
  if (value === undefined) return undefined;
  if (value !== "impure" && value !== "normal" && value !== "pure") {
    invalid(`${property} must be impure, normal, or pure when provided.`);
  }
  return value;
}

function parseSatellite(value: unknown) {
  if (!isRecord(value))
    invalid("Each Resource Well satellite must be an object.");
  const resourcePurity = optionalPurity(value, "resourcePurity");
  return {
    id: requiredString(value, "id"),
    ...(resourcePurity ? { resourcePurity } : {}),
  };
}

function parseProcessInstance(value: unknown): ProcessInstanceRequest {
  if (!isRecord(value))
    invalid("Each Process Node instance must be an object.");
  const clockSpeedPercent = optionalNumber(value, "clockSpeedPercent");
  const resourcePurity = optionalPurity(value, "resourcePurity");
  const somersloopCount = optionalNumber(value, "somersloopCount");
  const satellites = value.satellites;
  if (satellites !== undefined && !Array.isArray(satellites)) {
    invalid("satellites must be an array when provided.");
  }
  return {
    id: requiredString(value, "id"),
    ...(clockSpeedPercent !== undefined ? { clockSpeedPercent } : {}),
    ...(resourcePurity ? { resourcePurity } : {}),
    ...(somersloopCount !== undefined ? { somersloopCount } : {}),
    ...(satellites ? { satellites: satellites.map(parseSatellite) } : {}),
  };
}

function parseRequest(value: unknown): NodeRequest {
  if (!isRecord(value)) invalid("Node configuration must be an object.");
  const buildableId = requiredString(value, "buildableId");
  const id = requiredString(value, "id");
  const itemId = optionalString(value, "itemId");

  switch (value.kind) {
    case "buffer":
    case "router":
      return {
        buildableId,
        id,
        ...(itemId ? { itemId } : {}),
        kind: value.kind,
      };
    case "transport":
      if (value.mode !== "load" && value.mode !== "unload") {
        invalid("Transport mode must be load or unload.");
      }
      return {
        buildableId,
        id,
        ...(itemId ? { itemId } : {}),
        kind: "transport",
        mode: value.mode,
      };
    case "process": {
      if (!Array.isArray(value.instances)) {
        invalid("Process Node instances must be an array.");
      }
      return {
        buildableId,
        id,
        instances: value.instances.map(parseProcessInstance),
        ...(itemId ? { itemId } : {}),
        kind: "process",
        processId: requiredString(value, "processId"),
      };
    }
    default:
      return invalid("Node configuration has an unsupported kind.");
  }
}

/**
 * Validates a Node request and derives its canonical configuration, ports, and
 * profiles without resolving any connections.
 *
 * @throws {NodeConfigurationError} if ids, Buildable behavior, compatibility,
 * or operating settings are invalid.
 */
export function createNode(request: NodeRequest): Node {
  try {
    return request.kind === "process"
      ? createProcessNode(request)
      : createMaterialNode(request);
  } catch (error) {
    return configurationFailure(error);
  }
}

/**
 * Restores unknown persisted data into a canonical Node configuration. Derived
 * ports and profiles are deliberately discarded and can be recreated with
 * createNode.
 *
 * @throws {NodeConfigurationError} if the persisted structure or its domain
 * configuration is invalid.
 */
export function parseNodeConfiguration(value: unknown): NodeConfiguration {
  try {
    const node = createNode(parseRequest(value));
    return node.configuration;
  } catch (error) {
    return configurationFailure(error);
  }
}
