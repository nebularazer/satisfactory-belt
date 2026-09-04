import {
  findBuffer,
  findDescriptor,
  findRouter,
  findTransport,
} from "./catalog";
import type {
  BufferNode,
  MaterialNode,
  MaterialNodeRequest,
  MaterialPort,
  NodeProfile,
  RouterNode,
  TransportNode,
} from "./types";

export class MaterialNodeConfigurationError extends Error {
  override readonly name = "MaterialNodeConfigurationError";
}

function invalid(message: string): never {
  throw new MaterialNodeConfigurationError(message);
}

function requireId(value: string, label: string) {
  if (value.trim().length === 0) invalid(`${label} must not be empty.`);
}

function emptyProfile(consumedMw: number): NodeProfile {
  return {
    inputs: [],
    outputs: [],
    power: {
      consumed: { maximumMw: consumedMw, minimumMw: consumedMw },
      produced: { maximumMw: 0, minimumMw: 0 },
    },
  };
}

function bindPorts(ports: readonly MaterialPort[], itemId: string | undefined) {
  if (!itemId) return ports;
  const descriptor = findDescriptor(itemId);
  if (!descriptor) invalid(`Descriptor ${itemId} does not exist.`);
  if (
    !ports.some(
      ({ forms, purpose }) =>
        purpose !== "fuel" && forms.includes(descriptor.form),
    )
  ) {
    invalid(`The selected Buildable cannot carry ${descriptor.name}.`);
  }
  return ports.map((port) =>
    port.purpose !== "fuel" && port.forms.includes(descriptor.form)
      ? { ...port, itemId }
      : port,
  );
}

function createRouterNode(
  request: Extract<MaterialNodeRequest, { kind: "router" }>,
): RouterNode {
  const router = findRouter(request.buildableId);
  if (!router) invalid(`Router ${request.buildableId} does not exist.`);
  return {
    configuration: {
      buildableId: router.id,
      id: request.id,
      ...(request.itemId ? { itemId: request.itemId } : {}),
      kind: "router",
    },
    kind: "router",
    ports: bindPorts(router.ports, request.itemId),
    profile: emptyProfile(0),
  };
}

function createBufferNode(
  request: Extract<MaterialNodeRequest, { kind: "buffer" }>,
): BufferNode {
  const buffer = findBuffer(request.buildableId);
  if (!buffer) invalid(`Buffer ${request.buildableId} does not exist.`);
  return {
    configuration: {
      buildableId: buffer.id,
      id: request.id,
      ...(request.itemId ? { itemId: request.itemId } : {}),
      kind: "buffer",
    },
    kind: "buffer",
    ports: bindPorts(buffer.ports, request.itemId),
    profile: emptyProfile(0),
  };
}

function createTransportPorts(
  request: Extract<MaterialNodeRequest, { kind: "transport" }>,
  transport: NonNullable<ReturnType<typeof findTransport>>,
) {
  const direction = request.mode === "load" ? "input" : "output";
  const count =
    request.mode === "load"
      ? transport.cargo.localInputCount
      : transport.cargo.localOutputCount;
  const localPorts: MaterialPort[] = Array.from(
    { length: count },
    (_, index) => ({
      direction,
      forms: transport.cargo.forms,
      id: `cargo:${direction}:${index + 1}`,
      medium: transport.cargo.localMedium,
    }),
  );
  const remotePort: MaterialPort = {
    direction: request.mode === "load" ? "output" : "input",
    forms: transport.cargo.forms,
    id: "cargo:remote",
    medium: transport.cargo.remoteMedium,
  };
  const fuelPorts: MaterialPort[] = transport.fuelPort
    ? [
        {
          direction: "input",
          forms: ["solid"],
          id: "fuel:input",
          medium: "conveyor",
          purpose: "fuel",
        },
      ]
    : [];

  return bindPorts([...localPorts, remotePort, ...fuelPorts], request.itemId);
}

function createTransportNode(
  request: Extract<MaterialNodeRequest, { kind: "transport" }>,
): TransportNode {
  const transport = findTransport(request.buildableId);
  if (!transport) {
    invalid(`Transport Buildable ${request.buildableId} does not exist.`);
  }
  return {
    configuration: {
      buildableId: transport.id,
      id: request.id,
      ...(request.itemId ? { itemId: request.itemId } : {}),
      kind: "transport",
      mode: request.mode,
    },
    kind: "transport",
    ports: createTransportPorts(request, transport),
    profile: emptyProfile(transport.basePowerMw),
  };
}

/**
 * Creates a connection-ready Router, Buffer, or Transport Node without
 * resolving any material flow between its ports.
 *
 * @throws {MaterialNodeConfigurationError} if ids, Buildable behavior, or an
 * optional material binding is invalid.
 */
export function createMaterialNode(request: MaterialNodeRequest): MaterialNode {
  requireId(request.id, "Node id");
  switch (request.kind) {
    case "buffer":
      return createBufferNode(request);
    case "router":
      return createRouterNode(request);
    case "transport":
      return createTransportNode(request);
  }
}
