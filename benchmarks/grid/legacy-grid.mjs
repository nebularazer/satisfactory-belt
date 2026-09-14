import { Graphics } from "pixi.js";

// Exact grid algorithm from baseline 580f0f7, exposed for the isolated-grid benchmark.
export function createGrid() {
  const view = new Graphics();
  let lastKey = "";
  return {
    view,
    update(camera, viewport) {
      const key = `${camera.x},${camera.y},${camera.zoom},${viewport.width},${viewport.height}`;
      if (key === lastKey) return;
      lastKey = key;
      let spacing = 32 * camera.zoom;
      while (spacing < 20) spacing *= 2;
      while (spacing > 64) spacing /= 2;
      view.clear();
      const startX = ((camera.x % spacing) + spacing) % spacing;
      const startY = ((camera.y % spacing) + spacing) % spacing;
      for (let x = startX; x < viewport.width; x += spacing) {
        for (let y = startY; y < viewport.height; y += spacing) view.circle(x, y, 0.8);
      }
      view.fill("#dcdce2");
    },
    destroy() {
      view.destroy();
    },
  };
}
