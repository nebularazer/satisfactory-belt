import { PORT_PALETTE, PORT_TINTS, portId, samePort } from "@satisfactory-belt/canvas-core";
import type { PortSelection } from "@satisfactory-belt/canvas-core";
import { PIPE_PORT_RADIUS, PORT_RADIUS } from "@satisfactory-belt/factory-core";
import type { NodeDisplay } from "@satisfactory-belt/factory-core";
import { Graphics, Text } from "pixi.js";

export class PortHighlights {
  readonly view = new Graphics({ eventMode: "none" });
  private count: Text;
  private signature = "";
  private display: NodeDisplay | null = null;
  constructor(fontFamily: string) {
    this.count = new Text({
      text: "",
      style: { fontFamily, fontSize: 12, fill: PORT_PALETTE.compatible },
    });
    this.view.addChild(this.count);
  }
  update(nodeId: string, display: NodeDisplay, zoom: number, state: PortSelection) {
    const roles = display.ports.map((port) => {
      const ref = { nodeId, portKey: port.key };
      if (samePort(state.attempted?.port ?? null, ref)) return "invalid";
      if (samePort(state.anchor, ref)) return "anchor";
      if (
        samePort(state.preview, ref) ||
        (state.compatible.has(portId(ref)) &&
          [...state.hover, ...state.pending].some((p) => samePort(p, ref)))
      )
        return "active";
      if (state.compatible.has(portId(ref))) return "compatible";
      if ([...state.pending, ...state.hover].some((p) => samePort(p, ref))) return "hover";
      return null;
    });
    const signature = JSON.stringify([zoom, roles]);
    if (signature === this.signature && display === this.display) return;
    this.display = display;
    this.signature = signature;
    this.view.clear();
    this.count.visible = false;
    const extent = (index: number) => {
      const port = display.ports[index]!;
      const role = roles[index];
      const glyph = (port.transport === "pipe" ? PIPE_PORT_RADIUS : PORT_RADIUS) * zoom;
      return Math.max(
        glyph + (role ? 4 : 0) + (role === "anchor" ? 4 : 0),
        role === "active" || role === "invalid" ? 10 : 0,
      );
    };
    const crowded = display.ports.map(
      (port, index) =>
        roles[index] &&
        display.ports.some(
          (other, j) =>
            j !== index &&
            Math.hypot(port.x - other.x, port.y - other.y) * zoom < extent(index) + extent(j),
        ),
    );
    let matches = 0;
    for (let i = 0; i < display.ports.length; i++) {
      const role = roles[i];
      if (!role) continue;
      const port = display.ports[i]!;
      const color = PORT_PALETTE[role];
      if (role === "compatible" || role === "active") matches++;
      if (crowded[i]) continue;
      const x = port.x,
        y = port.y;
      const radius = (port.transport === "pipe" ? PIPE_PORT_RADIUS : PORT_RADIUS) + 3 / zoom;
      const ring = (r: number, dashed = false, backing = false) => {
        const vertices = Array.from({ length: port.transport === "pipe" ? 4 : 48 }, (_, step) => {
          const angle = (step / (port.transport === "pipe" ? 4 : 48)) * Math.PI * 2 - Math.PI / 2;
          return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
        });
        for (let j = 0; j < vertices.length; j++) {
          const a = vertices[j]!,
            b = vertices[(j + 1) % vertices.length]!;
          if (dashed && port.transport !== "pipe" && j % 6 >= 3) continue;
          this.view.moveTo(a.x, a.y);
          this.view.lineTo(
            dashed && port.transport === "pipe" ? (a.x + b.x) / 2 : b.x,
            dashed && port.transport === "pipe" ? (a.y + b.y) / 2 : b.y,
          );
        }
        this.view.stroke({
          color: backing ? PORT_TINTS[role] : color,
          width: ((role === "active" ? 3 : 2) + (backing ? 2 : 0)) / zoom,
        });
      };
      ring(radius, false, true);
      if (role === "anchor") ring(radius + 4 / zoom, false, true);
      ring(radius, role === "compatible");
      if (role === "anchor") ring(radius + 4 / zoom);
      if (role === "active" || role === "invalid") {
        const bx = x + (port.direction === "input" ? -1 : 1) * (radius + 12 / zoom);
        this.view
          .circle(bx, y, 9 / zoom)
          .fill(PORT_TINTS[role])
          .stroke({ color, width: 1 / zoom });
        // Lucide Check (M20 6 9 17l-5-5) and X paths, scaled from 24px.
        const line = (points: number[]) => {
          for (let k = 0; k < points.length; k += 2) {
            const px = bx + ((points[k]! - 12) * 0.6) / zoom;
            const py = y + ((points[k + 1]! - 12) * 0.6) / zoom;
            if (k === 0) this.view.moveTo(px, py);
            else this.view.lineTo(px, py);
          }
          this.view.stroke({ color, width: 2 / zoom });
        };
        if (role === "active") line([20, 6, 9, 17, 4, 12]);
        else {
          line([18, 6, 6, 18]);
          line([6, 6, 18, 18]);
        }
      }
    }
    if (crowded.some(Boolean)) {
      const role = roles.includes("invalid")
        ? "invalid"
        : roles.includes("anchor")
          ? "anchor"
          : roles.includes("active")
            ? "active"
            : matches
              ? "compatible"
              : "hover";
      this.view
        .roundRect(-3 / zoom, -3 / zoom, display.size + 6 / zoom, display.size + 6 / zoom, 8)
        .stroke({ color: PORT_TINTS[role], width: 4 / zoom })
        .roundRect(-3 / zoom, -3 / zoom, display.size + 6 / zoom, display.size + 6 / zoom, 8)
        .stroke({ color: PORT_PALETTE[role], width: 2 / zoom });
      if (matches) {
        this.count.style.fill = PORT_PALETTE[role];
        // Keep the count narrower than a reduced-zoom card; the inspector names the matches.
        this.count.text = String(matches);
        this.count.scale.set(1 / zoom);
        this.count.position.set(0, -20 / zoom);
        this.count.visible = true;
        this.view
          .rect(-2 / zoom, -22 / zoom, this.count.width + 4 / zoom, 18 / zoom)
          .fill(PORT_TINTS[role]);
      }
    }
  }
}
