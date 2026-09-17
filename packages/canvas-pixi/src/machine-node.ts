import { HEADER_HEIGHT, NODE_SIZE } from "@satisfactory-belt/factory-core";
import type { NodeDisplay } from "@satisfactory-belt/factory-core";
import { CanvasTextMetrics, Container, Graphics, Sprite, Text } from "pixi.js";

import type { IconCache } from "./icon-cache";
import { PortHighlights } from "./port-highlights";
import { CANVAS_PALETTES } from "./theme";
import type { CanvasPalette } from "./theme";

// Lucide Zap and Clock SVG paths, ISC license, from lucide-react 1.45.0.
// Separate arc flags/numbers explicitly for Pixi’s SVG parser.
const ZAP =
  '<path d="M 15.914 4 a 1.5 1.5 0 0 0 -2.474 -1.561 l -9 9 A 1.5 1.5 0 0 0 5.5 14 h 4.002 a 0.5 0.5 0 0 1 0.471 0.666 L 8.086 20 a 1.5 1.5 0 0 0 2.475 1.56 l 9 -9 A 1.5 1.5 0 0 0 18.5 10 h -3.997 a 0.5 0.5 0 0 1 -0.472 -0.667 z"/>';
const CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';

const STORAGE =
  '<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/>';
const FLUID =
  '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>';
const GENERATION =
  '<path d="m11 7-3 5h4l-3 5"/><path d="M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935"/><path d="M22 14v-4"/><path d="M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936"/>';

type IconView = { sprite: Sprite; placeholder: Graphics; id: string; size: number };

export class MachineNodeView {
  readonly portHighlights: PortHighlights;
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
    this.portHighlights = new PortHighlights();
    this.container.addChild(this.background, this.content, this.portHighlights.view);
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
        .roundRect(
          0,
          0,
          display.size,
          display.layout === "machine" ? (display.height ?? display.size) : display.size,
          8,
        )
        .fill(this.palette.card)
        .stroke({
          color: selected ? this.palette.highlight : this.palette.separator,
          width: 1,
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
    const footerY =
      (display.layout === "machine" ? (display.height ?? display.size) : display.size) - 32;
    if (display.layout === "logistics") {
      this.icon(display.machineIconId, display.size / 2, display.size / 2, 64, 0.7);
    } else {
      // Stop at the inner edge of the one-unit node border.
      const lines = new Graphics()
        .moveTo(0.5, HEADER_HEIGHT)
        .lineTo(NODE_SIZE - 0.5, HEADER_HEIGHT)
        .moveTo(0.5, footerY)
        .lineTo(NODE_SIZE - 0.5, footerY)
        .stroke({ color: this.palette.separator, width: 1 });
      this.content.addChild(lines);
      this.icon(display.machineIconId, 32, 32, 40);
      this.label(display.title, 64, display.subtitle ? 23 : 32, 176, 15, "600", this.palette.title);
      if (display.subtitle)
        this.label(display.subtitle, 64, 44, 176, 12, "400", this.palette.muted);
    }

    if (display.layout === "machine") {
      for (const row of display.bodyRows ?? []) {
        const label = this.label(
          row.label,
          0,
          row.y,
          display.size - 64,
          11,
          "400",
          this.palette.muted,
        );
        const width = CanvasTextMetrics.measureText(label.text, label.style).width;
        label.x = (display.size - width) / 2;
        // Marker-style separator: the centered type label interrupts two decorative lines.
        this.content.addChild(
          new Graphics()
            .moveTo(12, row.y)
            .lineTo(label.x - 8, row.y)
            .moveTo(label.x + width + 8, row.y)
            .lineTo(display.size - 12, row.y)
            .stroke({ color: this.palette.separator, width: 1 }),
        );
      }
    }
    for (const port of display.ports) {
      if (port.iconId)
        this.icon(port.iconId, port.direction === "input" ? 28 : display.size - 28, port.y, 24);
    }
    if (display.layout === "logistics") return;
    const footer = display.footer;
    const symbol =
      footer?.kind === "storage"
        ? STORAGE
        : footer?.kind === "fluid"
          ? FLUID
          : footer?.kind === "generation"
            ? GENERATION
            : ZAP;
    this.symbol(
      symbol,
      12,
      footerY + 8,
      footer ? this.palette.footer : this.palette.power.stroke,
      footer ? "none" : this.palette.power.fill,
    );
    const powerLabel =
      display.power.kind === "range"
        ? `Ø ${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(display.power.averageMegawatts)} MW`
        : display.powerLabel;
    this.label(
      footer?.label ?? powerLabel,
      32,
      footerY + 16,
      display.clockLabel ? 92 : 208,
      11,
      "500",
      this.palette.footer,
    );
    if (display.clockLabel) {
      this.symbol(CLOCK, 124, footerY + 8, this.palette.clock.stroke, this.palette.clock.fill);
      this.label(display.clockLabel, 144, footerY + 16, 42, 11, "500", this.palette.footer);
    }
    if (display.sloops) {
      this.icon(display.sloops.iconId, 197, footerY + 16, 16);
      this.label(
        display.sloops.used === null ? "Mixed" : `${display.sloops.used}/${display.sloops.slots}`,
        208,
        footerY + 16,
        42,
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
    return label;
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
