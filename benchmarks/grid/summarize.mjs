import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const directory = resolve(process.argv[2] ?? resolve(repository, "reports/grid-comparison"));
const data = JSON.parse(await readFile(resolve(directory, "results.json"), "utf8"));

function percentile(values, fraction) {
  const sorted = values.toSorted((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}
function stats(values) {
  return { median: percentile(values, 0.5), p95: percentile(values, 0.95) };
}

const groups = Map.groupBy(
  data.trials,
  (trial) => `${trial.mode}/${trial.profile.name}/${trial.motion}/${trial.candidate}`,
);
const rows = [...groups].map(([key, trials]) => {
  const samples = trials.flatMap((trial) => trial.samples);
  const perRoundMedian = trials.map((trial) =>
    percentile(
      trial.samples.map((sample) => sample.cpuMs),
      0.5,
    ),
  );
  const perRoundGpuMedian = trials.map((trial) =>
    percentile(
      trial.samples.map((sample) => sample.gpuMs),
      0.5,
    ),
  );
  return {
    key,
    rounds: trials.length,
    frames: samples.length,
    cpuMs: stats(samples.map((sample) => sample.cpuMs)),
    gpuMs: stats(samples.map((sample) => sample.gpuMs)),
    frameIntervalMs: stats(
      trials.flatMap((trial) =>
        trial.samples
          .slice(1)
          .map((sample, index) => sample.timestamp - trial.samples[index].timestamp),
      ),
    ),
    roundCpuMedianRange: [Math.min(...perRoundMedian), Math.max(...perRoundMedian)],
    roundGpuMedianRange: [Math.min(...perRoundGpuMedian), Math.max(...perRoundGpuMedian)],
    drawCalls: stats(samples.map((sample) => sample.drawCalls)),
    textureUploads: stats(samples.map((sample) => sample.textureUploads)),
    idleRenders: trials.reduce((sum, trial) => sum + trial.idleRenders, 0),
  };
});
await writeFile(resolve(directory, "summary.json"), JSON.stringify(rows, null, 2));
const header =
  "mode,profile,motion,candidate,frames,cpu_median_ms,cpu_p95_ms,gpu_median_ms,gpu_p95_ms,frame_interval_p95_ms,draw_calls_median,texture_uploads_median,idle_renders";
const csv = rows.map((row) =>
  [
    ...row.key.split("/"),
    row.frames,
    row.cpuMs.median,
    row.cpuMs.p95,
    row.gpuMs.median,
    row.gpuMs.p95,
    row.frameIntervalMs.p95,
    row.drawCalls.median,
    row.textureUploads.median,
    row.idleRenders,
  ].join(","),
);
await writeFile(resolve(directory, "summary.csv"), `${header}\n${csv.join("\n")}\n`);
for (const mode of ["grid", "scene"]) {
  console.log(`\n${mode} — milliseconds, median (p95)`);
  for (const profile of ["desktop-1x", "desktop-2x", "phone-3x"]) {
    for (const motion of ["pan", "zoom"]) {
      for (const candidate of ["baseline", "texture", "shader"]) {
        const row = rows.find((value) => value.key === `${mode}/${profile}/${motion}/${candidate}`);
        if (row)
          console.log(
            `${profile} ${motion} ${candidate}: CPU ${row.cpuMs.median.toFixed(3)} (${row.cpuMs.p95.toFixed(3)}), GPU ${row.gpuMs.median.toFixed(3)} (${row.gpuMs.p95.toFixed(3)})`,
          );
      }
    }
  }
}
