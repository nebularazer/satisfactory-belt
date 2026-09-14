/* oxlint-disable no-await-in-loop -- Benchmarks must run sequentially to avoid CPU/GPU contention between candidates. */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { cpus, platform, release } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { chromium } from "playwright";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, "../..");
const output = resolve(process.env.GRID_RESULTS ?? resolve(repository, "reports/grid-comparison"));
const candidates = [
  { name: "baseline", root: resolve(process.env.GRID_BASELINE_WORKTREE ?? repository) },
  {
    name: "texture",
    root: resolve(process.env.GRID_TEXTURE_WORKTREE ?? `${repository}-grid-texture`),
  },
  {
    name: "shader",
    root: resolve(process.env.GRID_SHADER_WORKTREE ?? `${repository}-grid-shader`),
  },
];
const smoke = process.argv.includes("--smoke");
await mkdir(output, { recursive: true });
for (const candidate of candidates) {
  candidate.commit = (
    await exec("git", ["rev-parse", "HEAD"], { cwd: candidate.root })
  ).stdout.trim();
  await exec(
    "pnpm",
    [
      "--filter",
      "@satisfactory-belt/web",
      "exec",
      "vite",
      "build",
      "--config",
      resolve(here, "vite.config.mjs"),
      "--mode",
      candidate.name,
    ],
    {
      cwd: repository,
      env: { ...process.env, GRID_WORKTREE: candidate.root },
      maxBuffer: 2 ** 22,
    },
  );
  console.log(`Built ${candidate.name} at ${candidate.commit.slice(0, 7)}`);
}

const buildRoot = resolve(repository, ".dev/grid-benchmark");
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const path = resolve(
      buildRoot,
      `.${url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname}`,
    );
    if (!path.startsWith(`${buildRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const body = await readFile(path);
    response
      .writeHead(200, {
        "Content-Type": mime[extname(path)] ?? "application/octet-stream",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cache-Control": "no-store",
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const args =
  process.env.GRID_SOFTWARE === "1"
    ? ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    : [
        "--no-sandbox",
        "--use-angle=vulkan",
        "--enable-features=Vulkan",
        "--disable-vulkan-surface",
      ];
const browser = await chromium.launch({
  executablePath: process.env.GRID_CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args,
});
const cdp = await browser.newBrowserCDPSession();
const system = await cdp.send("SystemInfo.getInfo");
const metadata = {
  date: new Date().toISOString(),
  browser: browser.version(),
  platform: `${platform()} ${release()}`,
  cpu: cpus()[0]?.model,
  gpu: system.gpu,
  args,
  candidates,
};
const trials = [];
const profiles = [
  { name: "desktop-1x", width: 1920, height: 1080, dpr: 1 },
  { name: "desktop-2x", width: 1920, height: 1080, dpr: 2 },
  { name: "phone-3x", width: 390, height: 844, dpr: 3 },
];

async function open(candidate, profile, mode, preference = "webgl") {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${origin}/${candidate.name}/`);
  await page.waitForFunction(() => Boolean(window.gridBench));
  const renderer = await page.evaluate((config) => window.gridBench.init(config), {
    ...profile,
    mode,
    preference,
  });
  if (!renderer.isolated)
    throw new Error("Benchmark requires cross-origin isolation for timing precision");
  return { context, page, errors, renderer };
}

try {
  if (smoke) {
    for (const candidate of candidates) {
      for (const preference of ["webgl", "webgpu"]) {
        const profile = { name: "visual", width: 640, height: 480, dpr: 2 };
        const { context, page, errors, renderer } = await open(
          candidate,
          profile,
          "grid",
          preference,
        );
        const cameras = [
          { name: "origin", x: 0, y: 0, zoom: 1 },
          { name: "fractional", x: 13.25, y: -17.5, zoom: 1.35 },
          { name: "minimum", x: -200, y: 50, zoom: 0.1 },
          { name: "maximum", x: 7, y: 19, zoom: 8 },
          { name: "distant", x: 1e9 + 13.25, y: -1e9 - 17.5, zoom: 1.35 },
        ];
        for (const camera of cameras) {
          await page.evaluate((value) => window.gridBench.draw(value), camera);
          const path = resolve(output, `${candidate.name}-${preference}-${camera.name}.png`);
          if (preference === "webgpu") {
            const data = await page.evaluate(() => window.gridBench.gpuSnapshot());
            await writeFile(path, Buffer.from(data.split(",")[1], "base64"));
          } else {
            await page.screenshot({ path, clip: { x: 0, y: 0, width: 320, height: 192 } });
          }
        }
        await page.evaluate(() => window.gridBench.draw({ x: 0, y: 0, zoom: 1 }, 3));
        const remaining = await page.evaluate(() => window.gridBench.destroy());
        if (remaining !== 0 || errors.length)
          throw new Error(JSON.stringify({ candidate, preference, remaining, errors }));
        trials.push({
          candidate: candidate.name,
          preference,
          renderer,
          cameras,
          capture: preference === "webgpu" ? "offscreen texture readback" : "browser screenshot",
        });
        await context.close();
        console.log(`Visual/lifecycle checks: ${candidate.name} ${preference}`);
      }
    }
    await writeFile(
      resolve(output, "visual-checks.json"),
      JSON.stringify({ metadata, trials }, null, 2),
    );
  } else {
    const rounds = Number(process.env.GRID_ROUNDS ?? 3);
    const firstRound = Number(process.env.GRID_FIRST_ROUND ?? 0);
    const frames = Number(process.env.GRID_FRAMES ?? 120);
    const modes = process.env.GRID_MODES?.split(",") ?? ["grid", "scene"];
    for (let round = firstRound; round < firstRound + rounds; round++) {
      const order = candidates.map((_, index) => candidates[(index + round) % candidates.length]);
      for (const mode of modes)
        for (const profile of profiles)
          for (const motion of ["pan", "zoom"]) {
            for (const candidate of order) {
              const { context, page, errors, renderer } = await open(candidate, profile, mode);
              const result = await page.evaluate((config) => window.gridBench.measure(config), {
                motion,
                frames,
                warmup: 40,
              });
              if (result.idleRenders !== 0 || errors.length)
                throw new Error(
                  JSON.stringify({
                    candidate,
                    mode,
                    motion,
                    errors,
                    idleRenders: result.idleRenders,
                  }),
                );
              if (renderer.gpuTimers && result.samples.some((sample) => sample.gpuMs === null))
                throw new Error("Missing GPU samples");
              trials.push({
                candidate: candidate.name,
                round,
                mode,
                profile,
                motion,
                renderer,
                ...result,
              });
              await context.close();
              await writeFile(
                resolve(output, "results.json"),
                JSON.stringify({ metadata, frames, rounds, firstRound, trials }, null, 2),
              );
              console.log(
                `${round - firstRound + 1}/${rounds} (round ${round}) ${mode} ${profile.name} ${motion}: ${candidate.name}`,
              );
            }
          }
    }
  }
} finally {
  await browser.close();
  server.close();
}
