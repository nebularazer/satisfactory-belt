import {
  Application,
  Assets,
  Container,
  Graphics,
  GraphicsContext,
  Sprite,
  Text,
  Texture,
  TilingSprite,
} from "pixi.js";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { selectImageUrl, type ResponsiveImage } from "@/game/catalog-images";

import type {
  CanvasEditor,
  CanvasEditorChange,
  CanvasEditorState,
} from "./editor";
import { canvasNodeId, type CanvasNode } from "./document";
import type { Point, Rectangle } from "./geometry";
import { GRID_INTERVAL } from "./grid";
import { stableImageScaleTier } from "./image-scale";
import { attachCanvasInteractions } from "./interactions";
import {
  createNodeCardModel,
  type NodeCardModel,
  type NodeCardPort,
  type NodeCardPortDirection,
  type NodeCardPortStatus,
} from "./node-card-model";
import {
  NODE_CARD_FOOTER_HEIGHT,
  NODE_CARD_HEADER_HEIGHT,
  nodeCardLayout,
  nodeCardPortY,
  type NodeCardLayout,
} from "./node-card-layout";
import {
  createPerformanceSampler,
  type CanvasPerformanceMetrics,
} from "./performance";
import { createRenderScheduler } from "./render-scheduler";
import { resolveResponsiveImage } from "./responsive-image-cache";
import { createTextureCache } from "./texture-cache";
import {
  createTextureLoadQueue,
  type TextureLoadPriority,
} from "./texture-load-queue";
import { visibleCanvasNodes } from "./visibility";
import {
  fitRectangleInViewport,
  panViewport,
  screenToWorld,
  ZOOM_STEP,
  zoomViewportAt,
  type Viewport,
} from "./viewport";

const MAX_POOLED_NODE_DISPLAYS = 256;
const GRID_DOT_RADIUS = 1;
const ITEM_IMAGE_SIZE = 24;
const MACHINE_IMAGE_SIZE = 40;

type RequestImage = (imageUrl: string, priority: TextureLoadPriority) => void;

export type InfiniteCanvasHandle = {
  fitContent: () => void;
  fitSelection: () => void;
  flushRender: () => void;
  getViewportCenter: () => Point;
  panBy: (delta: Point) => void;
  resetView: () => void;
  screenToWorld: (point: Point) => Point;
  zoomIn: () => void;
  zoomOut: () => void;
};

type InfiniteCanvasProps = {
  editor: CanvasEditor;
  onPerformanceMetricsChange: (metrics: CanvasPerformanceMetrics) => void;
  onRequestAddNode: (at: Point) => void;
  onViewportChange: (viewport: Viewport) => void;
  performanceMetricsEnabled: boolean;
  showGridDots: boolean;
};

type NodeDisplay = {
  baseX: number;
  baseY: number;
  card: Graphics;
  cardVisualKey: string;
  clock: Text;
  clockIcon: Graphics;
  container: Container;
  efficiency: Text;
  efficiencyIcon: Graphics;
  leftPorts: readonly MaterialDisplay[];
  machineImage: Sprite;
  machineImageVisualKey: string;
  model?: NodeCardModel;
  modelNode?: CanvasNode;
  node: CanvasNode;
  powerIcon: Graphics;
  rightPorts: readonly MaterialDisplay[];
  power: Text;
  subtitle: Text;
  title: Text;
  visualKey: string;
};

type MaterialDisplay = {
  image: Sprite;
  imageVisualKey: string;
  multipleIcon: Graphics;
  port: Graphics;
  rate: Text;
};

type GridDisplay = {
  spacing: number;
  sprite: TilingSprite;
  texture: Texture;
};

type CanvasSize = Readonly<{
  height: number;
  width: number;
}>;

function canvasHostSize(host: HTMLElement): CanvasSize {
  const bounds = host.getBoundingClientRect();
  return {
    height: Math.max(bounds.height, 1),
    width: Math.max(bounds.width, 1),
  };
}

function sameCanvasSize(left: CanvasSize, right: CanvasSize) {
  return left.height === right.height && left.width === right.width;
}

function gridSpacing(zoom: number) {
  let spacing = GRID_INTERVAL * zoom;
  while (spacing < 20) spacing *= 2;
  return spacing;
}

function createGridTexture(spacing: number) {
  const size = Math.max(1, Math.ceil(spacing));
  const tileScale = spacing / size;
  const canvas = document.createElement("canvas");
  canvas.height = size;
  canvas.width = size;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = "white";
    context.beginPath();
    context.arc(
      size / 2,
      size / 2,
      GRID_DOT_RADIUS / tileScale,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  return { texture: Texture.from(canvas), tileScale };
}

function createGridDisplay(width: number, height: number, zoom: number) {
  const spacing = gridSpacing(zoom);
  const { texture, tileScale } = createGridTexture(spacing);
  const sprite = new TilingSprite({ height, texture, width });
  sprite.eventMode = "none";
  sprite.tileScale.set(tileScale);
  return { spacing, sprite, texture };
}

function updateGrid(
  display: GridDisplay,
  viewport: Viewport,
  width: number,
  height: number,
) {
  const spacing = gridSpacing(viewport.zoom);
  if (display.spacing !== spacing) {
    const previousTexture = display.texture;
    const { texture, tileScale } = createGridTexture(spacing);
    display.spacing = spacing;
    display.sprite.texture = texture;
    display.sprite.tileScale.set(tileScale);
    display.texture = texture;
    previousTexture.destroy(true);
  }

  display.sprite.setSize(width, height);
  display.sprite.tilePosition.set(
    viewport.x - spacing / 2,
    viewport.y - spacing / 2,
  );
  const dark = document.documentElement.classList.contains("dark");
  display.sprite.tint = dark ? 0xd4d4d8 : 0x71717a;
  display.sprite.alpha = dark ? 0.34 : 0.4;
}

function textResolutionForZoom(zoom: number, rendererResolution: number) {
  return Math.max(rendererResolution, Math.ceil(zoom * rendererResolution));
}

const BLUEPRINT_COLORS = {
  bidirectional: 0x7c8798,
  blocked: 0xb75b65,
  input: 0xb8794f,
  output: 0x5a9b8c,
  selected: 0x3d6f9f,
  warning: 0xc29b3c,
} as const;

function materialContentAlpha(connected: boolean, dark: boolean) {
  if (connected) return 1;
  return dark ? 0.3 : 0.48;
}

function cachedTexture(imageUrl: string) {
  return Assets.cache.has(imageUrl) ? Assets.get<Texture>(imageUrl) : undefined;
}

function renderedImageUrl(
  image: ResponsiveImage | undefined,
  displaySize: number,
  imageScale: number,
) {
  return image ? (selectImageUrl(image, displaySize * imageScale) ?? "") : "";
}

function statusColor(status: NodeCardPortStatus) {
  if (status === "warning") return BLUEPRINT_COLORS.warning;
  if (status === "blocked") return BLUEPRINT_COLORS.blocked;
  return undefined;
}

function portColor(direction: NodeCardPortDirection) {
  if (direction === "input") return BLUEPRINT_COLORS.input;
  if (direction === "output") return BLUEPRINT_COLORS.output;
  return BLUEPRINT_COLORS.bidirectional;
}

const LUCIDE_PATHS = {
  activity:
    "M 22 12 h -2.48 a 2 2 0 0 0 -1.93 1.46 l -2.35 8.36 a 0.25 0.25 0 0 1 -0.48 0 L 9.24 2.18 a 0.25 0.25 0 0 0 -0.48 0 l -2.35 8.36 A 2 2 0 0 1 4.49 12 H 2",
  gauge: ["m 12 14 4 -4", "M 3.34 19 a 10 10 0 1 1 17.32 0"],
  layers: [
    "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
    "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
    "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
  ],
  zap: "M 15.914 4 a 1.5 1.5 0 0 0 -2.474 -1.561 l -9 9 A 1.5 1.5 0 0 0 5.5 14 h 4.002 a 0.5 0.5 0 0 1 0.471 0.666 L 8.086 20 a 1.5 1.5 0 0 0 2.475 1.56 l 9 -9 A 1.5 1.5 0 0 0 18.5 10 h -3.997 a 0.5 0.5 0 0 1 -0.472 -0.667 z",
} as const;

const lucideIconContexts = new Map<string, GraphicsContext>();

function createLucideIcon(paths: string | readonly string[], size: number) {
  const pathList = typeof paths === "string" ? [paths] : paths;
  const key = pathList.join("");
  let context = lucideIconContexts.get(key);
  if (!context) {
    context = new GraphicsContext().svg(
      `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathList.map((path) => `<path d="${path}" />`).join("")}</svg>`,
    );
    lucideIconContexts.set(key, context);
  }
  const graphics = new Graphics({ context });
  graphics.scale.set(size / 24);
  graphics.visible = false;
  return graphics;
}

function updateTextResolution(text: Text, resolution: number) {
  if (text.resolution !== resolution) text.resolution = resolution;
}

function fitText(text: Text, value: string, maximumWidth: number) {
  text.text = value;
  if (text.width <= maximumWidth) return;

  let lower = 0;
  let upper = value.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    text.text = `${value.slice(0, middle).trimEnd()}…`;
    if (text.width <= maximumWidth) lower = middle;
    else upper = middle - 1;
  }
  text.text = `${value.slice(0, lower).trimEnd()}…`;
}

function updateMaterialVisual(
  display: MaterialDisplay,
  material: NodeCardPort | undefined,
  side: "left" | "right",
  index: number,
  count: number,
  layout: NodeCardLayout,
  cardWidth: number,
  dark: boolean,
  imageScale: number,
  textResolution: number,
  requestImage: RequestImage,
) {
  const y = nodeCardPortY(layout, index, count);
  const visible = material !== undefined;
  display.image.visible = false;
  display.multipleIcon.visible = false;
  display.port.visible = visible;
  display.rate.visible =
    visible && (material?.rate !== undefined || (material?.ruleCount ?? 0) > 1);
  if (!visible || !material) return;

  if ((material.ruleCount ?? 0) > 1) {
    display.multipleIcon.visible = true;
  } else {
    const { displayUrl = "", requestedUrl = "" } = resolveResponsiveImage(
      material.image,
      ITEM_IMAGE_SIZE * imageScale,
      (imageUrl) => Assets.cache.has(imageUrl),
    );
    const texture = displayUrl ? cachedTexture(displayUrl) : undefined;
    if (display.imageVisualKey !== displayUrl) {
      display.image.texture = texture ?? Texture.EMPTY;
      display.imageVisualKey = displayUrl;
    }
    display.image.visible = Boolean(texture);
    if (requestedUrl && requestedUrl !== displayUrl) {
      requestImage(requestedUrl, "normal");
    }
  }

  display.image.anchor.set(0.5);
  display.image.position.set(side === "left" ? 28 : cardWidth - 28, y);
  display.image.setSize(ITEM_IMAGE_SIZE, ITEM_IMAGE_SIZE);
  const contentAlpha = materialContentAlpha(material.connected, dark);
  display.image.alpha = contentAlpha;
  display.multipleIcon.position.set(
    side === "left" ? 18 : cardWidth - 38,
    y - 10,
  );
  display.multipleIcon.tint = dark ? 0xa1a1aa : 0x71717a;
  display.multipleIcon.alpha = contentAlpha;
  display.rate.anchor.set(side === "left" ? 0 : 1, 0.5);
  display.rate.position.set(side === "left" ? 46 : cardWidth - 46, y);
  display.rate.text = material.rate ?? `${material.ruleCount ?? ""}`;
  display.rate.alpha = contentAlpha;
  display.rate.style = {
    fill: dark ? 0xe4e4e7 : 0x3f3f46,
    fontFamily: "Inter Variable, Inter, sans-serif",
    fontSize: 12,
    fontWeight: "400",
  };
  updateTextResolution(display.rate, textResolution);

  const center = statusColor(material.status);
  display.port
    .clear()
    .circle(0, 0, 10)
    .fill({ color: portColor(material.direction) })
    .circle(0, 0, 8)
    .fill({ color: dark ? 0x18181b : 0xffffff });
  if (center !== undefined) {
    display.port.circle(0, 0, 5).fill({ color: center });
  }
  display.port.position.set(side === "left" ? 0 : cardWidth, y);
}

function updateFooterIcons(
  display: NodeDisplay,
  model: NodeCardModel,
  dark: boolean,
  cardHeight: number,
  cardWidth: number,
) {
  const foreground = dark ? 0xd4d4d8 : 0x52525b;
  const efficiency = model.efficiency
    ? (statusColor(model.efficiency.status) ?? foreground)
    : foreground;
  let leftX = 16;

  display.clockIcon.visible = model.clock !== undefined;
  display.clockIcon.tint = foreground;
  if (model.clock !== undefined) {
    display.clockIcon.position.set(leftX, cardHeight - 31);
    display.clock.position.x = leftX + 20;
    leftX = display.clock.position.x + display.clock.width + 8;
  }

  display.efficiencyIcon.visible = model.efficiency !== undefined;
  display.efficiencyIcon.tint = efficiency;
  if (model.efficiency !== undefined) {
    display.efficiencyIcon.position.set(leftX, cardHeight - 31);
    display.efficiency.position.x = leftX + 20;
  }

  display.powerIcon.visible = model.power !== undefined;
  display.powerIcon.tint = 0xeab308;
  if (model.power !== undefined) {
    display.powerIcon.position.set(
      cardWidth - 38 - display.power.width,
      cardHeight - 32,
    );
  }
}

function nodeVisualKey(
  dark: boolean,
  selected: boolean,
  textResolution: number,
  zoom: number,
  imageScaleTier: number,
) {
  return `${dark}:${selected}:${textResolution}:${selected ? zoom : ""}:${imageScaleTier}`;
}

function updateNodeVisual(
  display: NodeDisplay,
  node: CanvasNode,
  dark: boolean,
  selected: boolean,
  textResolution: number,
  zoom: number,
  imageScale: number,
  imageScaleTier: number,
  requestImage: RequestImage,
) {
  const model =
    display.modelNode === node && display.model
      ? display.model
      : createNodeCardModel(node);
  display.model = model;
  display.modelNode = node;
  display.visualKey = nodeVisualKey(
    dark,
    selected,
    textResolution,
    zoom,
    imageScaleTier,
  );
  const layout = nodeCardLayout(node.configuration);
  const cardVisualKey = `${dark}:${selected}:${selected ? zoom : ""}:${node.width}:${node.height}:${layout.hasFooter}`;
  if (display.cardVisualKey !== cardVisualKey) {
    const body = dark ? 0x18181b : 0xffffff;
    const chrome = dark ? 0x242427 : 0xfafafa;
    const border = selected
      ? BLUEPRINT_COLORS.selected
      : dark
        ? 0x3f3f46
        : 0xd4d4d8;
    const card = display.card
      .clear()
      .roundRect(0, 0, node.width, node.height, 12)
      .fill({ color: body })
      .roundRect(0, 0, node.width, NODE_CARD_HEADER_HEIGHT, 12)
      .fill({ color: chrome })
      .rect(0, 12, node.width, NODE_CARD_HEADER_HEIGHT - 12)
      .fill({ color: chrome });
    if (layout.hasFooter) {
      card
        .roundRect(
          0,
          node.height - NODE_CARD_FOOTER_HEIGHT,
          node.width,
          NODE_CARD_FOOTER_HEIGHT,
          12,
        )
        .fill({ color: chrome })
        .rect(
          0,
          node.height - NODE_CARD_FOOTER_HEIGHT,
          node.width,
          NODE_CARD_FOOTER_HEIGHT - 12,
        )
        .fill({ color: chrome });
    }
    card
      .moveTo(0, NODE_CARD_HEADER_HEIGHT)
      .lineTo(node.width, NODE_CARD_HEADER_HEIGHT);
    if (layout.hasFooter) {
      card
        .moveTo(0, node.height - NODE_CARD_FOOTER_HEIGHT)
        .lineTo(node.width, node.height - NODE_CARD_FOOTER_HEIGHT);
    }
    card
      .stroke({ color: dark ? 0x3f3f46 : 0xe4e4e7, width: 1 })
      .roundRect(0, 0, node.width, node.height, 12)
      .stroke({ color: border, width: selected ? 2 / zoom : 1 });
    display.cardVisualKey = cardVisualKey;
  }

  display.title.style = {
    fill: dark ? 0xf4f4f5 : 0x27272a,
    fontFamily: "Inter Variable, Inter, sans-serif",
    fontSize: 16,
    fontWeight: "600",
  };
  display.subtitle.style = {
    fill: dark ? 0xa1a1aa : 0x71717a,
    fontFamily: "Inter Variable, Inter, sans-serif",
    fontSize: 12,
    fontWeight: "500",
  };
  const titleWidth = Math.max(40, node.width - 88);
  fitText(display.title, model.title, titleWidth);
  display.title.position.y = model.subtitle ? 6 : 14;
  display.subtitle.visible = model.subtitle !== undefined;
  fitText(display.subtitle, model.subtitle ?? "", titleWidth);

  const { displayUrl = "", requestedUrl = "" } = resolveResponsiveImage(
    model.buildableImage,
    MACHINE_IMAGE_SIZE * imageScale,
    (imageUrl) => Assets.cache.has(imageUrl),
  );
  const machineTexture = displayUrl ? cachedTexture(displayUrl) : undefined;
  if (display.machineImageVisualKey !== displayUrl) {
    display.machineImage.texture = machineTexture ?? Texture.EMPTY;
    display.machineImage.setSize(MACHINE_IMAGE_SIZE, MACHINE_IMAGE_SIZE);
    display.machineImage.visible = Boolean(machineTexture);
    display.machineImageVisualKey = displayUrl;
  }
  if (requestedUrl && requestedUrl !== displayUrl) {
    requestImage(requestedUrl, "high");
  }

  display.leftPorts.forEach((materialDisplay, index) =>
    updateMaterialVisual(
      materialDisplay,
      model.leftPorts[index],
      "left",
      index,
      model.leftPorts.length,
      layout,
      node.width,
      dark,
      imageScale,
      textResolution,
      requestImage,
    ),
  );
  display.rightPorts.forEach((materialDisplay, index) =>
    updateMaterialVisual(
      materialDisplay,
      model.rightPorts[index],
      "right",
      index,
      model.rightPorts.length,
      layout,
      node.width,
      dark,
      imageScale,
      textResolution,
      requestImage,
    ),
  );

  const metricStyle = {
    fill: dark ? 0xd4d4d8 : 0x52525b,
    fontFamily: "Inter Variable, Inter, sans-serif",
    fontSize: 12,
    fontWeight: "600" as const,
  };
  display.clock.visible = model.clock !== undefined;
  display.clock.text = model.clock ?? "";
  display.clock.style = metricStyle;
  display.efficiency.visible = model.efficiency !== undefined;
  display.efficiency.text = model.efficiency?.percent ?? "";
  display.efficiency.style = {
    ...metricStyle,
    fill:
      statusColor(model.efficiency?.status ?? "neutral") ??
      (dark ? 0xd4d4d8 : 0x52525b),
  };
  display.power.visible = model.power !== undefined;
  display.power.text = model.power ?? "";
  display.power.style = metricStyle;
  const footerCenterY = node.height - NODE_CARD_FOOTER_HEIGHT / 2;
  display.clock.position.y = footerCenterY;
  display.efficiency.position.y = footerCenterY;
  display.power.position.set(node.width - 16, footerCenterY);
  updateFooterIcons(display, model, dark, node.height, node.width);

  for (const text of [
    display.title,
    display.subtitle,
    display.clock,
    display.efficiency,
    display.power,
  ]) {
    updateTextResolution(text, textResolution);
  }
}

function createMaterialDisplay(): MaterialDisplay {
  const image = new Sprite(Texture.EMPTY);
  const multipleIcon = createLucideIcon(LUCIDE_PATHS.layers, 20);
  const port = new Graphics();
  const rate = new Text({ text: "" });
  image.visible = false;
  multipleIcon.visible = false;
  port.visible = false;
  rate.visible = false;
  return { image, imageVisualKey: "", multipleIcon, port, rate };
}

function createNodeDisplay(node: CanvasNode): NodeDisplay {
  const container = new Container();
  const card = new Graphics();
  const machineImage = new Sprite(Texture.EMPTY);
  const title = new Text({ text: "" });
  const subtitle = new Text({ text: "" });
  const leftPorts = Array.from({ length: 4 }, createMaterialDisplay);
  const rightPorts = Array.from({ length: 4 }, createMaterialDisplay);
  const clockIcon = createLucideIcon(LUCIDE_PATHS.gauge, 14);
  const efficiencyIcon = createLucideIcon(LUCIDE_PATHS.activity, 14);
  const powerIcon = createLucideIcon(LUCIDE_PATHS.zap, 16);
  const clock = new Text({ text: "" });
  const efficiency = new Text({ text: "" });
  const power = new Text({ text: "" });

  container.eventMode = "none";
  machineImage.anchor.set(0.5);
  machineImage.position.set(36, 24);
  machineImage.setSize(40, 40);
  machineImage.visible = false;
  title.position.set(72, 6);
  subtitle.position.set(72, 28);
  clock.anchor.set(0, 0.5);
  clock.position.set(36, 232);
  efficiency.anchor.set(0, 0.5);
  efficiency.position.set(93, 232);
  power.anchor.set(1, 0.5);
  power.position.set(240, 232);

  container.addChild(
    card,
    machineImage,
    title,
    subtitle,
    ...leftPorts.flatMap(({ image, multipleIcon, port, rate }) => [
      image,
      multipleIcon,
      rate,
      port,
    ]),
    ...rightPorts.flatMap(({ image, multipleIcon, port, rate }) => [
      image,
      multipleIcon,
      rate,
      port,
    ]),
    clockIcon,
    efficiencyIcon,
    powerIcon,
    clock,
    efficiency,
    power,
  );

  return {
    baseX: node.x,
    baseY: node.y,
    card,
    cardVisualKey: "",
    clock,
    clockIcon,
    container,
    efficiency,
    efficiencyIcon,
    leftPorts,
    machineImage,
    machineImageVisualKey: "",
    node,
    power,
    powerIcon,
    rightPorts,
    subtitle,
    title,
    visualKey: "",
  };
}

function recycleNodeDisplay(
  scene: Container,
  display: NodeDisplay,
  pool: NodeDisplay[],
) {
  scene.removeChild(display.container);
  display.machineImage.texture = Texture.EMPTY;
  display.machineImageVisualKey = "";
  for (const material of [...display.leftPorts, ...display.rightPorts]) {
    material.image.texture = Texture.EMPTY;
    material.imageVisualKey = "";
  }
  if (pool.length < MAX_POOLED_NODE_DISPLAYS) {
    pool.push(display);
  } else {
    display.container.destroy({ children: true });
  }
}

function visibleImageUrls(
  displays: ReadonlyMap<string, NodeDisplay>,
  imageScale: number,
) {
  const imageUrls = new Set<string>();
  for (const display of displays.values()) {
    const model = display.model;
    if (!model) continue;
    const machineImageUrl = renderedImageUrl(
      model.buildableImage,
      MACHINE_IMAGE_SIZE,
      imageScale,
    );
    if (machineImageUrl) imageUrls.add(machineImageUrl);
    if (display.machineImageVisualKey) {
      imageUrls.add(display.machineImageVisualKey);
    }
    for (const material of [...model.leftPorts, ...model.rightPorts]) {
      const itemImageUrl = renderedImageUrl(
        material.image,
        ITEM_IMAGE_SIZE,
        imageScale,
      );
      if (itemImageUrl) imageUrls.add(itemImageUrl);
    }
    for (const material of [...display.leftPorts, ...display.rightPorts]) {
      if (material.imageVisualKey) imageUrls.add(material.imageVisualKey);
    }
  }
  return imageUrls;
}

function syncDocument(
  scene: Container,
  state: CanvasEditorState,
  displays: Map<string, NodeDisplay>,
  pool: NodeDisplay[],
  visibleNodes: readonly CanvasNode[],
  textResolution: number,
  zoom: number,
  imageScale: number,
  imageScaleTier: number,
  requestImage: RequestImage,
  forceVisualUpdate = false,
) {
  const dark = document.documentElement.classList.contains("dark");
  const selectedIds = new Set(state.selectedIds);
  const visibleIds = new Set(visibleNodes.map(canvasNodeId));

  for (const [id, display] of displays) {
    if (visibleIds.has(id)) continue;
    recycleNodeDisplay(scene, display, pool);
    displays.delete(id);
  }

  for (const [index, node] of visibleNodes.entries()) {
    const id = canvasNodeId(node);
    const selected = selectedIds.has(id);
    let display = displays.get(id);

    if (!display) {
      display = pool.pop() ?? createNodeDisplay(node);
      displays.set(id, display);
    }

    display.baseX = node.x;
    display.baseY = node.y;
    display.node = node;
    const moveDelta = selected ? state.moveDelta : null;
    display.container.position.set(
      node.x + (moveDelta?.x ?? 0),
      node.y + (moveDelta?.y ?? 0),
    );
    if (display.container.parent !== scene) scene.addChild(display.container);
    if (scene.children[index] !== display.container) {
      scene.setChildIndex(display.container, index);
    }

    if (
      forceVisualUpdate ||
      display.modelNode !== node ||
      display.visualKey !==
        nodeVisualKey(dark, selected, textResolution, zoom, imageScaleTier)
    ) {
      updateNodeVisual(
        display,
        node,
        dark,
        selected,
        textResolution,
        zoom,
        imageScale,
        imageScaleTier,
        requestImage,
      );
    }
  }
}

function syncEditorChange(
  state: CanvasEditorState,
  displays: Map<string, NodeDisplay>,
  change: CanvasEditorChange,
  textResolution: number,
  zoom: number,
  imageScale: number,
  imageScaleTier: number,
  requestImage: RequestImage,
) {
  if (change.kind === "document" || change.kind === "settings") return false;

  const dark = document.documentElement.classList.contains("dark");
  const selectedIds =
    change.kind === "selection" ? new Set(state.selectedIds) : undefined;

  for (const id of change.nodeIds) {
    const display = displays.get(id);
    if (!display) continue;

    if (change.kind === "move") {
      display.container.position.set(
        display.baseX + change.delta.x,
        display.baseY + change.delta.y,
      );
    } else {
      updateNodeVisual(
        display,
        display.node,
        dark,
        selectedIds?.has(id) ?? false,
        textResolution,
        zoom,
        imageScale,
        imageScaleTier,
        requestImage,
      );
    }
  }

  return true;
}

function drawMarquee(graphics: Graphics, rectangle?: Rectangle) {
  graphics.clear();
  if (!rectangle) return;

  const x = rectangle.width < 0 ? rectangle.x + rectangle.width : rectangle.x;
  const y = rectangle.height < 0 ? rectangle.y + rectangle.height : rectangle.y;
  const width = Math.abs(rectangle.width);
  const height = Math.abs(rectangle.height);

  graphics
    .rect(x, y, width, height)
    .fill({ color: 0x6366f1, alpha: 0.1 })
    .stroke({ color: 0x6366f1, alpha: 0.8, pixelLine: true, width: 1 });
}

export const InfiniteCanvas = forwardRef<
  InfiniteCanvasHandle,
  InfiniteCanvasProps
>(function InfiniteCanvas(
  {
    editor,
    onPerformanceMetricsChange,
    onRequestAddNode,
    onViewportChange,
    performanceMetricsEnabled,
    showGridDots,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const gridRef = useRef<GridDisplay | null>(null);
  const sceneRef = useRef<Container | null>(null);
  const nodeDisplaysRef = useRef(new Map<string, NodeDisplay>());
  const nodeDisplayPoolRef = useRef<NodeDisplay[]>([]);
  const worldRef = useRef<Container | null>(null);
  const marqueeRef = useRef<Graphics | null>(null);
  const onPerformanceMetricsChangeRef = useRef(onPerformanceMetricsChange);
  const performanceSamplerRef = useRef<ReturnType<
    typeof createPerformanceSampler
  > | null>(null);
  const performanceMetricsEnabledRef = useRef(performanceMetricsEnabled);
  const renderSchedulerRef = useRef<ReturnType<
    typeof createRenderScheduler
  > | null>(null);
  const textResolutionRef = useRef(1);
  const imageScaleTierRef = useRef(stableImageScaleTier(1));
  const textureLoadQueueRef = useRef<ReturnType<
    typeof createTextureLoadQueue
  > | null>(null);
  const textureCacheRef = useRef<ReturnType<typeof createTextureCache> | null>(
    null,
  );
  const textureRefreshPendingRef = useRef(false);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  const showGridDotsRef = useRef(showGridDots);

  onPerformanceMetricsChangeRef.current = onPerformanceMetricsChange;
  performanceMetricsEnabledRef.current = performanceMetricsEnabled;
  showGridDotsRef.current = showGridDots;

  const requestImage: RequestImage = (imageUrl, priority) => {
    textureLoadQueueRef.current?.request(imageUrl, priority);
  };

  const syncVisibleScene = (forceVisualUpdate = false) => {
    const app = appRef.current;
    const scene = sceneRef.current;
    if (!app || !scene) return;

    const state = editor.getState();
    const imageScale = viewportRef.current.zoom * app.renderer.resolution;
    syncDocument(
      scene,
      state,
      nodeDisplaysRef.current,
      nodeDisplayPoolRef.current,
      visibleCanvasNodes(state, viewportRef.current, app.screen, editor.query),
      textResolutionRef.current,
      viewportRef.current.zoom,
      imageScale,
      imageScaleTierRef.current,
      requestImage,
      forceVisualUpdate,
    );
    textureCacheRef.current?.retain(
      visibleImageUrls(nodeDisplaysRef.current, imageScale),
    );
  };

  const renderViewport = (viewport: Viewport) => {
    const previousZoom = viewportRef.current.zoom;
    viewportRef.current = viewport;

    const app = appRef.current;
    const grid = gridRef.current;
    const world = worldRef.current;

    if (app && grid && world) {
      const updateStartedAt = performance.now();
      const imageScale = viewport.zoom * app.renderer.resolution;
      imageScaleTierRef.current = stableImageScaleTier(
        imageScale,
        imageScaleTierRef.current,
      );
      world.position.set(viewport.x, viewport.y);
      world.scale.set(viewport.zoom);
      updateGrid(grid, viewport, app.screen.width, app.screen.height);
      if (previousZoom !== viewport.zoom) {
        textResolutionRef.current = textResolutionForZoom(
          viewport.zoom,
          app.renderer.resolution,
        );
      }
      syncVisibleScene();
      if (performanceMetricsEnabledRef.current) {
        performanceSamplerRef.current?.recordUpdate(
          performance.now() - updateStartedAt,
        );
      }
      renderSchedulerRef.current?.request();
    }

    if (previousZoom !== viewport.zoom) onViewportChange(viewport);
  };

  const viewportCenter = (): Point => {
    const app = appRef.current;
    return app
      ? { x: app.screen.width / 2, y: app.screen.height / 2 }
      : { x: 0, y: 0 };
  };

  const zoomBy = (factor: number) => {
    const current = viewportRef.current;
    renderViewport(
      zoomViewportAt(current, current.zoom * factor, viewportCenter()),
    );
  };

  const resetView = () => {
    const center = viewportCenter();
    renderViewport({ x: center.x, y: center.y, zoom: 1 });
  };

  const getViewportCenter = () =>
    screenToWorld(viewportCenter(), viewportRef.current);

  const fit = (scope: "all" | "selection") => {
    const app = appRef.current;
    const bounds = editor.getBounds(scope);
    if (!app || !bounds) return;
    renderViewport(
      fitRectangleInViewport(bounds, app.screen, scope === "selection" ? 2 : 1),
    );
  };

  useImperativeHandle(ref, () => ({
    fitContent: () => fit("all"),
    fitSelection: () => fit("selection"),
    flushRender: () => {
      renderSchedulerRef.current?.cancel();
      appRef.current?.render();
    },
    getViewportCenter,
    panBy: (delta) => {
      renderViewport(panViewport(viewportRef.current, delta));
    },
    resetView,
    screenToWorld: (point) => screenToWorld(point, viewportRef.current),
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
  }));

  useEffect(() => {
    performanceSamplerRef.current?.reset();
    if (performanceMetricsEnabled) renderSchedulerRef.current?.request();
  }, [performanceMetricsEnabled]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.sprite.visible = showGridDots;
    renderSchedulerRef.current?.request();
  }, [showGridDots]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    const initialSize = canvasHostSize(host);
    let active = true;
    let longTaskObserver: PerformanceObserver | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let themeObserver: MutationObserver | undefined;
    let unsubscribeEditor: (() => void) | undefined;
    let removeListeners: (() => void) | undefined;

    void app
      .init({
        antialias: true,
        autoStart: false,
        autoDensity: true,
        backgroundAlpha: 0,
        height: initialSize.height,
        preference: "webgl",
        resolution: Math.min(window.devicePixelRatio, 2),
        width: initialSize.width,
      })
      .then(() => {
        if (!active) {
          app.destroy(true);
          return;
        }

        const mountedSize = canvasHostSize(host);
        if (
          app.screen.height !== mountedSize.height ||
          app.screen.width !== mountedSize.width
        ) {
          app.renderer.resize(mountedSize.width, mountedSize.height);
        }

        appRef.current = app;
        app.canvas.className = "infinite-canvas__surface";
        app.canvas.setAttribute("aria-label", "Infinite canvas");
        app.canvas.setAttribute("role", "application");
        app.canvas.dataset.cursor = "grab";
        app.canvas.tabIndex = 0;
        host.appendChild(app.canvas);

        const longTasksSupported =
          import.meta.env.DEV &&
          typeof PerformanceObserver !== "undefined" &&
          PerformanceObserver.supportedEntryTypes.includes("longtask");
        const performanceSampler = createPerformanceSampler((metrics) => {
          onPerformanceMetricsChangeRef.current(metrics);
        }, longTasksSupported);
        if (longTasksSupported) {
          longTaskObserver = new PerformanceObserver((entries) => {
            if (!performanceMetricsEnabledRef.current) return;
            performanceSampler.recordLongTasks(
              entries.getEntries().map(({ duration }) => duration),
            );
          });
          longTaskObserver.observe({ entryTypes: ["longtask"] });
        }
        const renderScheduler = createRenderScheduler((timestamp) => {
          if (!active) return;
          if (textureRefreshPendingRef.current) {
            textureRefreshPendingRef.current = false;
            syncVisibleScene(true);
          }
          const renderStartedAt = performance.now();
          app.render();
          if (performanceMetricsEnabledRef.current) {
            performanceSampler.recordRender(
              timestamp,
              performance.now() - renderStartedAt,
              nodeDisplaysRef.current.size,
            );
          }
        });
        performanceSamplerRef.current = performanceSampler;
        renderSchedulerRef.current = renderScheduler;
        const textureCache = createTextureCache({
          isCached: (imageUrl) => Assets.cache.has(imageUrl),
          unload: (imageUrl) => Assets.unload(imageUrl),
        });
        textureCacheRef.current = textureCache;
        const textureLoadQueue = createTextureLoadQueue({
          isCached: (imageUrl) => Assets.cache.has(imageUrl),
          load: (imageUrl) => Assets.load(imageUrl),
          maxConcurrent: 4,
          onDiscard: (imageUrl) => {
            void Assets.unload(imageUrl).catch(() => undefined);
          },
          onReady: (imageUrl) => {
            textureCache.recordLoaded(imageUrl);
            textureRefreshPendingRef.current = true;
            renderScheduler.request();
          },
        });
        textureLoadQueueRef.current = textureLoadQueue;

        const initialViewport = {
          x: app.screen.width / 2,
          y: app.screen.height / 2,
          zoom: 1,
        };
        const grid = createGridDisplay(
          app.screen.width,
          app.screen.height,
          initialViewport.zoom,
        );
        grid.sprite.visible = showGridDotsRef.current;
        const world = new Container();
        const scene = new Container();
        const marquee = new Graphics();
        app.stage.eventMode = "none";
        scene.eventMode = "none";
        world.addChild(scene);
        app.stage.addChild(grid.sprite, world, marquee);
        gridRef.current = grid;
        worldRef.current = world;
        sceneRef.current = scene;
        marqueeRef.current = marquee;

        textResolutionRef.current = textResolutionForZoom(
          initialViewport.zoom,
          app.renderer.resolution,
        );
        renderViewport(initialViewport);
        let canvasSize = mountedSize;

        const canvas = app.canvas;

        removeListeners = attachCanvasInteractions(canvas, editor, {
          fit,
          getViewport: () => viewportRef.current,
          getViewportCenter: viewportCenter,
          panBy: (delta) => {
            renderViewport(panViewport(viewportRef.current, delta));
          },
          requestNode: onRequestAddNode,
          resetView,
          setMarquee: (rectangle) => {
            drawMarquee(marquee, rectangle);
            renderScheduler.request();
          },
          zoomAt: (factor, anchor) => {
            const current = viewportRef.current;
            renderViewport(
              zoomViewportAt(current, current.zoom * factor, anchor),
            );
          },
        });

        resizeObserver = new ResizeObserver(([entry]) => {
          if (!entry) return;

          const nextSize = canvasHostSize(host);
          if (sameCanvasSize(nextSize, canvasSize)) return;

          app.renderer.resize(nextSize.width, nextSize.height);
          renderViewport(
            panViewport(viewportRef.current, {
              x: (nextSize.width - canvasSize.width) / 2,
              y: (nextSize.height - canvasSize.height) / 2,
            }),
          );
          canvasSize = nextSize;
        });
        resizeObserver.observe(host);

        themeObserver = new MutationObserver(() => {
          const updateStartedAt = performance.now();
          updateGrid(
            grid,
            viewportRef.current,
            app.screen.width,
            app.screen.height,
          );
          syncVisibleScene();
          if (performanceMetricsEnabledRef.current) {
            performanceSampler.recordUpdate(
              performance.now() - updateStartedAt,
            );
          }
          renderScheduler.request();
        });
        themeObserver.observe(document.documentElement, {
          attributeFilter: ["class"],
          attributes: true,
        });

        unsubscribeEditor = editor.subscribe((change) => {
          const updateStartedAt = performance.now();
          let needsRender: boolean;
          if (change.kind === "document") {
            syncVisibleScene();
            needsRender = true;
          } else {
            needsRender = syncEditorChange(
              editor.getState(),
              nodeDisplaysRef.current,
              change,
              textResolutionRef.current,
              viewportRef.current.zoom,
              viewportRef.current.zoom * app.renderer.resolution,
              imageScaleTierRef.current,
              requestImage,
            );
            textureCache.retain(
              visibleImageUrls(
                nodeDisplaysRef.current,
                viewportRef.current.zoom * app.renderer.resolution,
              ),
            );
          }
          if (!needsRender) return;

          if (performanceMetricsEnabledRef.current) {
            performanceSampler.recordUpdate(
              change.updateTimeMs + performance.now() - updateStartedAt,
            );
          }
          renderScheduler.request();
        });
      });

    return () => {
      active = false;
      removeListeners?.();
      unsubscribeEditor?.();
      longTaskObserver?.disconnect();
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      textureLoadQueueRef.current?.dispose();
      textureLoadQueueRef.current = null;
      textureCacheRef.current?.dispose();
      textureCacheRef.current = null;
      textureRefreshPendingRef.current = false;
      renderSchedulerRef.current?.cancel();
      gridRef.current?.texture.destroy(true);
      gridRef.current = null;
      performanceSamplerRef.current = null;
      renderSchedulerRef.current = null;
      sceneRef.current = null;
      worldRef.current = null;
      marqueeRef.current = null;
      nodeDisplaysRef.current.clear();
      for (const display of nodeDisplayPoolRef.current) {
        display.container.destroy({ children: true });
      }
      nodeDisplayPoolRef.current = [];
      textResolutionRef.current = 1;
      imageScaleTierRef.current = stableImageScaleTier(1);

      if (appRef.current === app) {
        appRef.current = null;
        app.destroy(true, { children: true });
      }
    };
  }, [editor, onRequestAddNode, onViewportChange]);

  return <div className="infinite-canvas" ref={hostRef} />;
});
