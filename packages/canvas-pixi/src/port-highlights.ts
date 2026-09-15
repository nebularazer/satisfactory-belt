import { portId, samePort } from "@satisfactory-belt/canvas-core";
import type { PortSelection } from "@satisfactory-belt/canvas-core";
import { PIPE_PORT_RADIUS, PORT_RADIUS } from "@satisfactory-belt/factory-core";
import type { NodeDisplay } from "@satisfactory-belt/factory-core";
import { Graphics } from "pixi.js";

import type { CanvasPalette } from "./theme";

export class PortHighlights {
  readonly view = new Graphics({ eventMode: "none" });
  private signature = "";
  private display: NodeDisplay | null = null;
  private palette: CanvasPalette | null = null;

  update(nodeId: string, display: NodeDisplay, state: PortSelection, palette: CanvasPalette) {
    const roles = display.ports.map((port) => {
      const ref = { nodeId, portKey: port.key };
      const anchor = samePort(state.anchor, ref);
      if (state.anchor && !anchor && !state.compatible.has(portId(ref))) return "muted";
      if (
        anchor ||
        samePort(state.preview, ref) ||
        state.hover.some((candidate) => samePort(candidate, ref)) ||
        state.pending.some((candidate) => samePort(candidate, ref))
      )
        return "highlight";
      return "base";
    });
    const signature = JSON.stringify(roles);
    if (signature === this.signature && display === this.display && palette === this.palette)
      return;
    this.display = display;
    this.palette = palette;
    this.signature = signature;
    this.view.clear();

    for (let i = 0; i < display.ports.length; i++) {
      const port = display.ports[i]!;
      const colors = palette[port.direction];
      const muted = roles[i] === "muted";
      const radius = port.transport === "pipe" ? PIPE_PORT_RADIUS : PORT_RADIUS;
      const shape = (size = radius) => {
        if (port.transport === "pipe")
          this.view.poly([
            port.x,
            port.y - size,
            port.x + size,
            port.y,
            port.x,
            port.y + size,
            port.x - size,
            port.y,
          ]);
        else this.view.circle(port.x, port.y, size);
        return this.view;
      };
      // Keep a one-unit gap, with an opaque backing that hides the node border.
      // Offset diamond vertices further to match the circle's perpendicular spacing.
      if (roles[i] === "highlight")
        shape(radius + 2.75 * (port.transport === "pipe" ? Math.SQRT2 : 1))
          .fill(palette.card)
          .stroke({ color: palette.highlight, width: 1.5 });
      // Opaque muted fills keep the node border from showing through the port center.
      shape()
        .fill(muted ? palette.card : colors.fill)
        .stroke({ color: muted ? palette.border : colors.stroke, width: 2 });
    }
  }
}
