# Canvas grid performance comparison

Recommendation: choose `perf/grid-procedural-shader`. It removes per-dot CPU geometry work, needs no texture uploads during zoom, and outperformed the tiled texture on this machine, particularly at higher pixel densities. Its cost is a small custom shader maintained in GLSL and WGSL. This recommendation applies to these implementations and this hardware; it is not a universal ranking of rendering techniques.

Both candidates remain on separate branches. Neither has been merged into `feat/project-agnostic-canvas`, and neither has been discarded. The base canvas work was committed first so both experiments start from exactly the same code.

| Candidate              | Branch                         | Commit                                     |
| ---------------------- | ------------------------------ | ------------------------------------------ |
| Existing Graphics dots | `feat/project-agnostic-canvas` | `580f0f7cb0e719356c5bc1cc80abc3fcb33e9b9c` |
| Repeated dot texture   | `perf/grid-tiling-sprite`      | `a2253497004442a39d09c1120823365de828d308` |
| Procedural dot shader  | `perf/grid-procedural-shader`  | `e299276b2df1bd8cb394fe05d328dbd56bd02d24` |

**What changed**

Each candidate replaces only the grid rendering in `packages/canvas-pixi`, behind `createGrid()` with `view`, `update(camera, viewport, resolution)`, and `destroy()`. Input handling, rectangles, selection, text, menus, and zoom controls use the same code. Both keep the existing visual rules: dots anchored to world coordinates, adaptive spacing of 20–64 CSS pixels, 0.8 CSS pixel radius, and `#dcdce2` color. Dot edges have small antialiasing differences from the original Graphics circles.

The texture version uses Pixi's [TilingSprite](https://pixijs.com/8.x/guides/components/scene-objects/tiling-sprite), repeating one supersampled canvas tile across the viewport. Panning changes the tile offset. Zooming redraws and uploads that tile so the dot radius remains constant on screen. At DPR 1, 2, and 3 the tile is respectively 128², 256², and 512² pixels (64 KiB, 256 KiB, and 1 MiB of RGBA texels, excluding browser/driver copies). A static tile scaled without repainting would also scale the dots, changing the comparison's visual requirements. A texture atlas or distance-field texture would be another implementation to evaluate, not a result established here.

The shader version uses a [Mesh](https://pixijs.com/8.x/guides/components/scene-objects/mesh) with one four-vertex viewport quad. A periodic distance calculation produces the dots with antialiased edges. Camera updates change uniforms, without texture uploads or geometry regeneration. Both implementations reduce camera offsets modulo spacing before sending them to the GPU, avoiding loss of alignment after very long pans. Both release their owned GPU resources on destruction.

**Measurements**

**2,000-rectangle scene: CPU — median (p95), ms**

| Profile / motion  | Existing Graphics | Tiled texture | Procedural shader |
| ----------------- | ----------------: | ------------: | ----------------: |
| desktop-1x / pan  |       4.24 (6.74) |   0.81 (1.07) |       0.65 (1.00) |
| desktop-1x / zoom |       1.51 (4.18) |   0.73 (1.77) |       0.62 (1.75) |
| desktop-2x / pan  |       5.14 (7.98) |   0.72 (1.07) |       0.66 (0.98) |
| desktop-2x / zoom |       1.90 (4.49) |   0.77 (2.77) |       0.59 (2.43) |
| phone-3x / pan    |       0.92 (1.60) |   0.38 (0.59) |       0.36 (0.60) |
| phone-3x / zoom   |       0.61 (1.20) |   1.25 (2.21) |       0.47 (1.23) |

**2,000-rectangle scene: GPU — median (p95), ms**

| Profile / motion  | Existing Graphics | Tiled texture | Procedural shader |
| ----------------- | ----------------: | ------------: | ----------------: |
| desktop-1x / pan  |       1.57 (2.29) |   1.49 (1.70) |       1.47 (1.67) |
| desktop-1x / zoom |       0.93 (1.21) |   1.06 (1.34) |       1.06 (1.30) |
| desktop-2x / pan  |       4.62 (6.27) |   6.27 (7.40) |       4.61 (6.21) |
| desktop-2x / zoom |       3.52 (5.16) |   4.59 (6.12) |       4.15 (5.93) |
| phone-3x / pan    |       1.12 (1.47) |   2.38 (2.69) |       1.11 (1.38) |
| phone-3x / zoom   |       0.81 (1.19) |   1.46 (2.38) |       1.07 (1.40) |

**Grid alone: CPU — median (p95), ms**

| Profile / motion  | Existing Graphics | Tiled texture | Procedural shader |
| ----------------- | ----------------: | ------------: | ----------------: |
| desktop-1x / pan  |       3.59 (5.31) |   0.20 (0.28) |       0.16 (0.21) |
| desktop-1x / zoom |       1.12 (2.20) |   0.31 (0.42) |       0.16 (0.22) |
| desktop-2x / pan  |       3.74 (5.75) |   0.19 (0.24) |       0.15 (0.20) |
| desktop-2x / zoom |       1.27 (2.71) |   0.38 (0.48) |       0.15 (0.20) |
| phone-3x / pan    |       0.69 (1.23) |   0.19 (0.28) |       0.15 (0.20) |
| phone-3x / zoom   |       0.38 (0.68) |   0.90 (1.26) |       0.15 (0.20) |

Values are milliseconds per rendered frame. CPU and GPU measurements overlap and must not be added. GPU time includes the entire scene render, clearing, and resolving the antialiased render target. These are frame-work measurements, not claims of an equivalent increase in displayed FPS.

The shader reduced median scene CPU time during desktop panning by **85% at DPR 1** (4.24 → 0.65 ms) and **87% at DPR 2** (5.14 → 0.66 ms). Its isolated-grid CPU medians stayed around 0.15–0.16 ms across the tested profiles and motions. These large CPU reductions were consistent across the repeated runs.

Against the tiled texture, shader scene GPU time during panning was **26% lower at DPR 2** (6.27 → 4.61 ms) and **53% lower in the phone-shaped DPR 3 profile** (2.38 → 1.11 ms). The desktop DPR 1 GPU difference was only 0.03 ms; it is too small to make a strong general claim. At DPR 2, per-round median panning GPU ranges were 5.61–6.80 ms for the texture and 4.08–4.78 ms for the shader.

There is a real tradeoff against the original Graphics implementation: during zoom, the shader's median scene GPU time increased by approximately **14%, 18%, and 32%** across the three profiles, despite reducing CPU time. It shades the whole viewport, whereas Graphics renders sparse dot geometry. The tiled texture was also slower than Graphics on both CPU and GPU during zoom in the DPR 3 profile. No universal GPU improvement is claimed.

All three grid-only implementations used one draw call per frame. The optimization therefore comes from removing per-dot CPU work, not reducing that draw count. The texture issued one texture upload per measured zoom frame; the shader issued none. During full-scene panning at desktop sizes, Pixi batched the texture with other content (three draw calls versus four for the shader), yet the texture still used more GPU time at DPR 2. All 108 trials recorded **zero canvas renders during the 150 ms idle observation**.

Frame pacing did not show a general improvement: scene p95 frame intervals were 16.67 ms for all candidates at desktop DPR 1 and 50 ms for all at desktop DPR 2. In the phone-shaped zoom case they were 16.67 ms for Graphics and 33.33 ms for both candidates. This headless setup includes presentation/scheduling costs outside the timed render work. The data supports a CPU-work reduction and a preference between the two candidates; it does **not** establish improved interactive FPS. A short check on actual target devices is the next useful validation before making mobile or battery-efficiency claims.

**How the comparison was run**

- Date: 14 September 2026. Intel Core Ultra 7 165U, integrated Intel Meteor Lake graphics, Mesa 25.2.8, Linux 7.2.0, Chrome 153.0.8010.36. Chrome used hardware ANGLE/Vulkan, confirmed through CDP and the WebGL renderer string, not SwiftShader.
- Production Vite builds, WebGL2 with antialiasing enabled. The fixture uses the project's real renderer and camera controller for the scene test. The isolated-grid test uses the exact existing Graphics algorithm or the candidate's grid module.
- Three viewport profiles: 1920×1080 CSS pixels at DPR 1; 1920×1080 at DPR 2 (3840×2160 physical pixels); and 390×844 at DPR 3 (1170×2532 physical pixels). The last is a phone-shaped viewport on the same Intel GPU, not a physical mobile-device benchmark.
- Two workloads: grid alone, and 2,000 labeled rectangles using the real canvas renderer and its existing visibility handling. Panning uses 75% zoom. The measured zoom trace ranges from approximately 89.4% to 800%, including adaptive grid-spacing changes. Minimum 10% zoom is covered by visual checks, not by the measured part of this zoom trace.
- Three repetitions of each candidate/profile/workload/motion combination, with candidate order rotated. Each trial has 40 warmup frames and 120 measured frames: 108 accepted trials, 12,960 measured frames. Initial load, shader compilation, and first text allocation are outside the reported timings. This is not a startup or sustained thermal/battery benchmark.
- CPU timing includes camera-command work and the scheduled canvas update/render callback, measured with high-resolution `performance.now()` on a cross-origin-isolated page. GPU timing uses [asynchronous disjoint timer queries](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query), read after the trial; missing/disjoint samples cause failure. Instrumentation counts draw calls and texture upload calls and explicitly flushes commands after each GPU query. That overhead is shared by all candidates; absolute production timings can differ.
- The first complete round was excluded because a separate pixel-validation process overlapped it. A replacement round ran after the original run finished, without visual validation or builds from other tasks running concurrently. Accepted rounds are 1, 2, and 3, retaining balanced candidate orders. The exclusion and supplemental run metadata are recorded in the raw results.
- Results pool 360 measured frames per table entry. They are descriptive medians and 95th percentiles, not confidence intervals. Per-round CPU and GPU median ranges and frame intervals are in the summary JSON. Frame scheduling, other machine activity, and GPU clock changes can affect results; small differences should not be treated as universal wins.

**Validation and limits**

Both implementation branches passed `pnpm check`: formatting, lint, TypeScript, all 16 existing core tests, and production build. The build retains the existing large-bundle warning. Benchmarking also exercised both real canvas integrations with 2,000 rectangles.

Visual checks cover WebGL and WebGPU at the origin, fractional offsets/zoom, 10% and 800% zoom, and offsets of approximately ±1 billion pixels. All 30 captured images passed expected dot-position checks. The smoke run also changes rendering density from 2 to 3 and destroys each canvas without console errors or leftover canvas elements. These checks validate alignment and lifecycle; they do not constitute a GPU memory-leak measurement.

WebGPU screenshots through this headless Vulkan configuration presented black for all three candidates, including the unchanged baseline. WebGPU output was therefore verified by reading an offscreen GPU render texture. WebGPU performance and normal on-screen presentation were not benchmarked. WebGL screenshots were captured normally. Other browsers and actual mobile GPUs remain unmeasured.

Example fractional-zoom captures: [baseline](baseline-webgl-fractional.png), [texture](texture-webgl-fractional.png), [shader](shader-webgl-fractional.png). Full evidence: [visual cases and renderer metadata](visual-checks.json), [dot-position checks](visual-validation.json), [raw frame data](results.json), [summary JSON](summary.json), and [summary CSV](summary.csv).

**Reproducing the comparison**

Keep the two candidate worktrees alongside the base checkout as `satisfactory-belt-grid-texture` and `satisfactory-belt-grid-shader`, and run `pnpm install --frozen-lockfile` in all three. From the base checkout:

```sh
node benchmarks/grid/run.mjs --smoke
python3 benchmarks/grid/validate.py
node benchmarks/grid/run.mjs
node benchmarks/grid/summarize.mjs
```

The optional pixel validator requires Python Pillow. Run it before or after timing, never concurrently. The benchmark requires Chrome, and the default hardware arguments target this Linux Vulkan setup. `GRID_CHROME` overrides the executable; `GRID_SOFTWARE=1` deliberately selects SwiftShader and must not be mixed with hardware results. `GRID_RESULTS` chooses an output directory. `GRID_ROUNDS`, `GRID_FIRST_ROUND`, `GRID_FRAMES`, and `GRID_MODES` control trial scope. Defaults produce three full rounds. The summary script accepts an optional results-directory argument.

`GRID_BASELINE_WORKTREE`, `GRID_TEXTURE_WORKTREE`, and `GRID_SHADER_WORKTREE` override source locations. If the base branch later incorporates a grid candidate, point the baseline override at a separate checkout of `580f0f7`; otherwise the baseline would no longer be the original Graphics implementation. Every run records the source commit hashes and hardware metadata.

After the implementation is selected, squash the winning branch into `feat/project-agnostic-canvas`, run the relevant checks, and then remove the losing branch/worktree. No merge or deletion has been performed as part of this comparison.
