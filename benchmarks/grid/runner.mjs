/* oxlint-disable no-await-in-loop -- Measure distinct frames sequentially and wait for asynchronous GPU queries. */
import "@fontsource-variable/inter";
import { mountCanvas } from "@benchmark/canvas";
import { createGrid } from "@benchmark/grid";
import { CanvasController } from "@satisfactory-belt/canvas-core";
import { Application, RenderTexture } from "pixi.js";

const nativeRAF = window.requestAnimationFrame.bind(window);
const nextFrame = () => new Promise(nativeRAF);
let app;
let grid;
let scene;
let controller;
let schedulingCanvas = false;
let captureSceneFrame;
let drawCalls = 0;
let uploads = 0;
let renderedFrames = 0;
let viewport;
let resolution;
let gl;
let timer;
let pendingQueries = [];
let activeSample;

// Measure the real mountCanvas callback, without adding instrumentation to product code.
window.requestAnimationFrame = (callback) => {
  const isCanvasFrame = schedulingCanvas;
  return nativeRAF((timestamp) => {
    if (isCanvasFrame && captureSceneFrame) {
      const done = captureSceneFrame;
      captureSceneFrame = null;
      const result = sample(() => callback(timestamp));
      result.timestamp = timestamp;
      done(result);
    } else callback(timestamp);
  });
};

function sample(renderFrame) {
  drawCalls = 0;
  uploads = 0;
  const result = { cpuMs: 0, gpuMs: null, drawCalls: 0, textureUploads: 0 };
  activeSample = result;
  const start = performance.now();
  renderFrame();
  result.cpuMs = performance.now() - start;
  result.drawCalls = drawCalls;
  result.textureUploads = uploads;
  activeSample = null;
  return result;
}

function instrumentRenderer() {
  gl = app.renderer.gl;
  timer = gl?.getExtension("EXT_disjoint_timer_query_webgl2");
  if (gl) {
    for (const name of [
      "drawElements",
      "drawArrays",
      "drawElementsInstanced",
      "drawArraysInstanced",
    ]) {
      const original = gl[name].bind(gl);
      gl[name] = (...args) => {
        drawCalls++;
        return original(...args);
      };
    }
    for (const name of ["texImage2D", "texSubImage2D"]) {
      const original = gl[name].bind(gl);
      gl[name] = (...args) => {
        uploads++;
        return original(...args);
      };
    }
  }
  const render = app.render.bind(app);
  app.render = () => {
    renderedFrames++;
    const query = activeSample && timer ? gl.createQuery() : null;
    if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
    const result = render();
    if (query) {
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      gl.flush();
      pendingQueries.push({ query, result: activeSample });
    }
    return result;
  };
}

async function init({ mode, width, height, dpr, preference = "webgl" }) {
  viewport = { width, height };
  resolution = dpr;
  const host = document.getElementById("host");
  if (mode === "scene") {
    const original = Application.prototype.render;
    Application.prototype.render = function (...args) {
      app = this;
      return original.apply(this, args);
    };
    controller = new CanvasController({
      items: Array.from({ length: 2000 }, (_, index) => ({
        id: String(index),
        text: `Rectangle ${index}`,
        x: (index % 50) * 260,
        y: Math.floor(index / 50) * 220,
        width: 220,
        height: 160,
      })),
      onMove() {},
    });
    scene = await mountCanvas(host, controller, { fontFamily: "Inter Variable" });
    await nextFrame();
    await nextFrame();
    Application.prototype.render = original;
  } else {
    app = new Application();
    await app.init({
      width,
      height,
      resolution: dpr,
      preference,
      antialias: true,
      autoStart: false,
      autoDensity: true,
      background: "#fafafa",
    });
    host.append(app.canvas);
    app.stage.eventMode = "none";
    grid = createGrid();
    app.stage.addChild(grid.view);
    grid.update({ x: 0, y: 0, zoom: 1 }, viewport, dpr);
    app.render();
  }
  instrumentRenderer();
  const debug = gl?.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: app.renderer.name,
    gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    gpuTimers: Boolean(timer),
    isolated: crossOriginIsolated,
    canvas: { width: app.canvas.width, height: app.canvas.height },
  };
}

async function readQueries() {
  const deadline = performance.now() + 5000;
  let disjoint = false;
  while (pendingQueries.length && performance.now() < deadline) {
    disjoint ||= gl.getParameter(timer.GPU_DISJOINT_EXT);
    pendingQueries = pendingQueries.filter(({ query, result }) => {
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return true;
      result.gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
      return false;
    });
    if (pendingQueries.length) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (pendingQueries.length) throw new Error("GPU queries did not complete");
  if (disjoint) throw new Error("Disjoint GPU timer interval: discard and rerun this trial");
}

function cameraAt(index, motion) {
  return {
    x: 13.25 + index * 2.75,
    y: -29.5 + index * 1.125,
    zoom: motion === "pan" ? 0.75 : 0.1 * 80 ** ((Math.sin(index / 40) + 1) / 2),
  };
}

async function measure({ motion, warmup = 40, frames = 120 }) {
  const results = [];
  if (scene) {
    controller.command("reset");
    controller.zoomTo(0.75, { x: 0, y: 0 });
    if (motion === "pan") controller.pointerDown({ id: 1, x: -1000, y: -1000 });
    await nextFrame();
    await nextFrame();
  }
  for (let index = -warmup; index < frames; index++) {
    const camera = cameraAt(index, motion);
    let result;
    if (scene) {
      const frame = new Promise((resolve) => {
        captureSceneFrame = resolve;
      });
      schedulingCanvas = true;
      const start = performance.now();
      if (motion === "pan")
        controller.pointerMove({ id: 1, x: -1000 + camera.x, y: -1000 + camera.y });
      else controller.zoomTo(camera.zoom, { x: viewport.width / 2, y: viewport.height / 2 });
      const inputMs = performance.now() - start;
      schedulingCanvas = false;
      result = await frame;
      result.cpuMs += inputMs;
    } else {
      const timestamp = await nextFrame();
      result = sample(() => {
        grid.update(camera, viewport, resolution);
        app.render();
      });
      result.timestamp = timestamp;
    }
    if (index >= 0) results.push(result);
  }
  if (scene && motion === "pan") controller.cancel();
  await nextFrame();
  await nextFrame();
  await readQueries();
  const count = renderedFrames;
  await new Promise((resolve) => setTimeout(resolve, 150));
  return { samples: results, idleRenders: renderedFrames - count };
}

async function draw(camera, dpr = resolution) {
  resolution = dpr;
  app.renderer.resize(viewport.width, viewport.height, dpr);
  grid.update(camera, viewport, dpr);
  app.render();
  await nextFrame();
}

function destroy() {
  if (scene) scene.destroy();
  else {
    grid.destroy();
    app.destroy(true, { children: true });
  }
  return document.querySelectorAll("canvas").length;
}

async function gpuSnapshot() {
  // Headless Vulkan presents black WebGPU canvases here, including the unchanged baseline.
  // Read an offscreen GPU texture directly so shader correctness is still verifiable.
  const target = RenderTexture.create({
    ...viewport,
    resolution,
    format: "rgba8unorm",
    antialias: true,
  });
  app.renderer.render({ container: app.stage, target, clear: true, clearColor: "#fafafa" });
  const device = app.renderer.gpu.device;
  const width = target.source.pixelWidth;
  const height = target.source.pixelHeight;
  const stride = Math.ceil((width * 4) / 256) * 256;
  const buffer = device.createBuffer({
    size: stride * height,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyTextureToBuffer(
    { texture: app.renderer.texture.getGpuSource(target.source) },
    { buffer, bytesPerRow: stride },
    { width, height },
  );
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(GPUMapMode.READ);
  const mapped = new Uint8Array(buffer.getMappedRange());
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    pixels.set(mapped.subarray(y * stride, y * stride + width * 4), y * width * 4);
  buffer.unmap();
  buffer.destroy();
  target.destroy(true);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas.toDataURL();
}

window.gridBench = { init, measure, draw, destroy, gpuSnapshot };
