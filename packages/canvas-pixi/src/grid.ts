import type { Camera, Size } from "@satisfactory-belt/canvas-core";
import { GRID_SIZE } from "@satisfactory-belt/canvas-core";
import { Geometry, Mesh, Shader, UniformGroup } from "pixi.js";

const vertex = `
precision highp float;
attribute vec2 aPosition;
uniform vec2 uViewport;
varying vec2 vScreen;
void main() {
  vScreen = aPosition * uViewport;
  gl_Position = vec4(aPosition.x * 2.0 - 1.0, 1.0 - aPosition.y * 2.0, 0.0, 1.0);
}`;

const fragment = `
precision highp float;
varying vec2 vScreen;
uniform vec2 uOffset;
uniform float uSpacing;
uniform float uPixelSize;
void main() {
  vec2 cell = mod(vScreen - uOffset + uSpacing * 0.5, uSpacing) - uSpacing * 0.5;
  float coverage = 1.0 - smoothstep(0.8 - uPixelSize * 0.5, 0.8 + uPixelSize * 0.5, length(cell));
  gl_FragColor = vec4(vec3(204.0, 205.0, 214.0) / 255.0 * coverage, coverage);
}`;

/** A root-level viewport background: one quad, no per-dot geometry or texture uploads. */
export function createGrid() {
  const uniforms = new UniformGroup({
    uViewport: { value: new Float32Array([1, 1]), type: "vec2<f32>" },
    uOffset: { value: new Float32Array(2), type: "vec2<f32>" },
    uSpacing: { value: GRID_SIZE, type: "f32" },
    uPixelSize: { value: 1, type: "f32" },
  });
  const shader = Shader.from({
    gl: { vertex, fragment },
    resources: { gridUniforms: uniforms },
  });
  const geometry = new Geometry({
    attributes: {
      aPosition: {
        buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        format: "float32x2",
        stride: 8,
        offset: 0,
      },
    },
    indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });
  const view = new Mesh({ geometry, shader, eventMode: "none" });
  let destroyed = false;

  function update(camera: Camera, viewport: Size, resolution: number) {
    let spacing = GRID_SIZE * camera.zoom;
    // Hide minor dots when zoomed out; never subdivide the world grid or change snapping.
    while (spacing < 20) spacing *= 2;
    uniforms.uniforms.uViewport[0] = viewport.width;
    uniforms.uniforms.uViewport[1] = viewport.height;
    // Keep values small before conversion to GPU floats, even after very long pans.
    uniforms.uniforms.uOffset[0] = ((camera.x % spacing) + spacing) % spacing;
    uniforms.uniforms.uOffset[1] = ((camera.y % spacing) + spacing) % spacing;
    uniforms.uniforms.uSpacing = spacing;
    uniforms.uniforms.uPixelSize = 1 / resolution;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    view.destroy();
    geometry.destroy(true);
    // Shader programs are cached by Pixi and may be shared by another mounted canvas.
    shader.destroy();
  }

  return { view, update, destroy };
}
