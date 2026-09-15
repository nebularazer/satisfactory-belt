import {
  FOOTER_Y,
  HEADER_HEIGHT,
  NODE_SIZE,
  PIPE_PORT_RADIUS,
  PORT_RADIUS,
} from "@satisfactory-belt/factory-core";
import type { NodeDisplay } from "@satisfactory-belt/factory-core";
import { CanvasTextMetrics, Container, Graphics, Sprite, Text } from "pixi.js";

import type { IconCache } from "./icon-cache";
import { CANVAS_PALETTES } from "./theme";
import type { CanvasPalette } from "./theme";

// Lucide Zap and Clock SVG paths, ISC license, from lucide-react 1.45.0.
// Separate arc flags/numbers explicitly for Pixi’s SVG parser.
const ZAP =
  '<path d="M 15.914 4 a 1.5 1.5 0 0 0 -2.474 -1.561 l -9 9 A 1.5 1.5 0 0 0 5.5 14 h 4.002 a 0.5 0.5 0 0 1 0.471 0.666 L 8.086 20 a 1.5 1.5 0 0 0 2.475 1.56 l 9 -9 A 1.5 1.5 0 0 0 18.5 10 h -3.997 a 0.5 0.5 0 0 1 -0.472 -0.667 z"/>';
const CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';

type IconView = { sprite: Sprite; placeholder: Graphics; id: string; size: number };

export class MachineNodeView {
  readonly container = new Container({ eventMode: "none" });
  private background = new Graphics();
  private content = new Container({ eventMode: "none" });
  private texts: Text[] = [];
  private icons: IconView[] = [];
  private display: NodeDisplay | null = null;
  private palette: CanvasPalette = CANVAS_PALETTES.light;
  private selected = false;
  private zoom = -1;
  private fontFamily: string;
  private cache: IconCache;

  constructor(fontFamily: string, cache: IconCache) {
    this.fontFamily = fontFamily;
    this.cache = cache;
    this.container.addChild(this.background, this.content);
  }

  update(
    display: NodeDisplay,
    zoom: number,
    resolution: number,
    selected: boolean,
    palette: CanvasPalette,
  ) {
    const changed = this.display !== display || this.palette !== palette;
    this.palette = palette;
    if (changed) {
      this.content.removeChildren().forEach((child) => child.destroy({ children: true }));
      this.texts = [];
      this.icons = [];
      this.build(display);
      this.display = display;
    }
    if (changed || this.zoom !== zoom || this.selected !== selected) {
      this.background
        .clear()
        .roundRect(0, 0, display.size, display.size, 8)
        .fill(this.palette.card)
        .stroke({
          color: selected ? this.palette.selection : this.palette.border,
          width: (selected ? 1.5 : 1) / zoom,
        });
      this.zoom = zoom;
      this.selected = selected;
      this.container.scale.set(zoom);
    }
    const textResolution = resolution * Math.max(1, 2 ** Math.ceil(Math.log2(zoom)));
    for (const label of this.texts) {
      if (label.resolution !== textResolution) label.resolution = textResolution;
    }
    for (const icon of this.icons) {
      const texture = this.cache.get(icon.id, icon.size * zoom * resolution);
      icon.placeholder.visible = !texture;
      icon.sprite.visible = Boolean(texture);
      if (texture && icon.sprite.texture !== texture) {
        icon.sprite.texture = texture;
        icon.sprite.width = icon.size;
        icon.sprite.height = icon.size;
      }
    }
  }

  private build(display: NodeDisplay) {
    if (display.layout === "logistics") {
      this.icon(display.machineIconId, display.size / 2, display.size / 2, 64, 0.7);
    } else {
      const lines = new Graphics()
        .moveTo(0, HEADER_HEIGHT)
        .lineTo(NODE_SIZE, HEADER_HEIGHT)
        .moveTo(0, FOOTER_Y)
        .lineTo(NODE_SIZE, FOOTER_Y)
        .stroke({ color: this.palette.separator, width: 1 });
      this.content.addChild(lines);
      this.icon(display.machineIconId, 32, 32, 40);
      this.label(display.title, 64, 23, 176, 15, "600", this.palette.title);
      this.label(display.subtitle, 64, 44, 176, 12, "400", this.palette.muted);
    }

    const markers = new Graphics();
    for (const port of display.ports) {
      const colors = this.palette[port.direction];
      if (port.transport === "pipe") {
        markers.poly([
          port.x,
          port.y - PIPE_PORT_RADIUS,
          port.x + PIPE_PORT_RADIUS,
          port.y,
          port.x,
          port.y + PIPE_PORT_RADIUS,
          port.x - PIPE_PORT_RADIUS,
          port.y,
        ]);
      } else markers.circle(port.x, port.y, PORT_RADIUS);
      markers.fill(colors.fill).stroke({ color: colors.stroke, width: 2 });
      if (port.iconId)
        this.icon(port.iconId, port.direction === "input" ? 28 : display.size - 28, port.y, 24);
    }
    this.content.addChild(markers);
    if (display.layout === "logistics") return;
    this.symbol(ZAP, 12, 232, this.palette.power.stroke, this.palette.power.fill);
    this.label(display.powerLabel, 32, 240, 80, 11, "500", this.palette.footer);
    if (display.clockLabel) {
      this.symbol(CLOCK, 120, 232, this.palette.clock.stroke, this.palette.clock.fill);
      this.label(display.clockLabel, 140, 240, 49, 11, "500", this.palette.footer);
    }
    if (display.sloops) {
      this.icon(display.sloops.iconId, 207, 240, 18);
      this.label(
        `${display.sloops.used}/${display.sloops.slots}`,
        221,
        240,
        27,
        11,
        "500",
        display.sloops.used ? this.palette.selection : this.palette.footer,
      );
    }
  }

  private label(
    value: string,
    x: number,
    y: number,
    width: number,
    fontSize: number,
    fontWeight: "400" | "500" | "600",
    fill: string,
  ) {
    const label = new Text({
      text: value,
      anchor: { x: 0, y: 0.5 },
      style: { fontFamily: this.fontFamily, fontSize, fontWeight, fill },
    });
    // Only measure on content changes, never while dragging or on individual zoom steps.
    if (CanvasTextMetrics.measureText(value, label.style).width > width) {
      const chars = Array.from(value);
      let low = 0;
      let high = chars.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (
          CanvasTextMetrics.measureText(`${chars.slice(0, mid).join("")}…`, label.style).width <=
          width
        )
          low = mid;
        else high = mid - 1;
      }
      label.text = `${chars.slice(0, low).join("")}…`;
    }
    label.position.set(x, y);
    this.texts.push(label);
    this.content.addChild(label);
  }

  private icon(id: string, x: number, y: number, size: number, opacity = 1) {
    const placeholder = new Graphics()
      .roundRect(x - size / 2, y - size / 2, size, size, 4)
      .fill(this.palette.placeholder)
      .stroke({ color: this.palette.border, width: 1 });
    const sprite = new Sprite({ anchor: 0.5 });
    sprite.position.set(x, y);
    sprite.alpha = opacity;
    sprite.visible = false;
    this.content.addChild(placeholder, sprite);
    this.icons.push({ sprite, placeholder, id, size });
  }

  private symbol(paths: string, x: number, y: number, color: string, fill = "none") {
    const icon = new Graphics().svg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
    );
    icon.position.set(x, y);
    icon.scale.set(16 / 24);
    this.content.addChild(icon);
  }

  restoreText() {
    for (const label of this.texts) label.unload();
  }
}
