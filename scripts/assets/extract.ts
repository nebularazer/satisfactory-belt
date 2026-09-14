import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { collectIcons, decodeJson } from "./docs.ts";
import { reportedPngHashes } from "./export-result.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function main() {
  const { values } = parseArgs({
    options: {
      "game-dir": { type: "string", default: join(root, ".assets/download") },
      locale: { type: "string", default: "en-US" },
      "ue-version": { type: "string", default: "GAME_UE5_6" },
      image: { type: "string", default: "satisfactory-assets:baa4504" },
      "docs-only": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(`Extract Satisfactory data and descriptor icons into ignored .assets/extracted/.

pnpm assets:extract [--game-dir PATH] [--locale en-US] [--docs-only]
                    [--ue-version GAME_UE5_6] [--image satisfactory-assets:baa4504]

Download/setup instructions: docs/asset-extraction.md
Each run gets a new output directory; downloads and earlier exports are preserved.`);
    return;
  }
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(values.locale)) {
    throw new Error("Invalid locale; use a CommunityResources filename such as en-US or de.");
  }
  if (!/^GAME_\w+$/.test(values["ue-version"])) {
    throw new Error("Invalid UE version; use a CUE4Parse identifier such as GAME_UE5_6.");
  }

  const gameDir = resolve(values["game-dir"]);
  const resources = join(gameDir, "CommunityResources");
  const sourcePath = join(resources, "Docs", `${values.locale}.json`);
  await requireFile(sourcePath, "Download the community files; see docs/asset-extraction.md.");
  const bytes = await readFile(sourcePath);
  const docs = decodeJson(bytes);
  const icons = collectIcons(docs);
  const manifest = [
    ...new Map(
      icons.map(({ assetPath, objectName }) => [assetPath, { assetPath, objectName }]),
    ).values(),
  ].toSorted((a, b) => a.assetPath.localeCompare(b.assetPath, "en"));

  if (!values["docs-only"]) {
    if (manifest.length === 0) throw new Error("No descriptor icons found in the game JSON.");
    const paks = join(gameDir, "FactoryGame/Content/Paks");
    for (const name of [
      "FactoryGame-Windows.utoc",
      "FactoryGame-Windows.ucas",
      "global.utoc",
      "global.ucas",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Only four container companions.
      await requireFile(join(paks, name), "Download the game containers first.");
    }
    const archives = await readdir(paks);
    if (!archives.some((name) => name.endsWith(".pak")))
      throw new Error(`No .pak files in ${paks}.`);
    await run("docker", ["image", "inspect", values.image], root, true);
  }

  const outputRoot = join(root, ".assets/extracted");
  await mkdir(outputRoot, { recursive: true });
  const output = await mkdtemp(join(outputRoot, `${values.locale}-`));
  const writeJson = (name: string, value: unknown) =>
    writeFile(join(output, name), `${JSON.stringify(value, null, 2)}\n`);
  await writeJson("docs.json", docs);
  await writeJson("icons.json", icons);
  await writeJson("image-manifest.json", manifest);
  const metadata = {
    source: sourcePath,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    extractedAt: new Date().toISOString(),
    locale: values.locale,
    ueVersion: values["ue-version"],
    image: values.image,
    uniqueIcons: manifest.length,
    iconSize: 256,
  };
  await writeJson("extraction.json", { ...metadata, status: "incomplete" });
  console.log(
    `Output: ${output}\nSelected ${manifest.length} textures for ${icons.length} descriptors.`,
  );

  if (values["docs-only"]) {
    await writeJson("extraction.json", { ...metadata, status: "docs-only" });
    console.log("Wrote UTF-8 docs.json and the icon selection. Images have not been exported.");
    return;
  }

  // --mount is CSV syntax even with spawn argument arrays. Reject ambiguous host paths.
  if ([gameDir, output].some((path) => /[,"\r\n]/.test(path))) {
    throw new Error("Docker mount paths cannot contain commas, quotes or newlines.");
  }
  const user =
    process.getuid && process.getgid ? ["--user", `${process.getuid()}:${process.getgid()}`] : [];
  await run(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      ...user,
      "--mount",
      `type=bind,src=${gameDir},dst=/game,readonly`,
      "--mount",
      `type=bind,src=${output},dst=/output`,
      values.image,
      "--manifest",
      "/output/image-manifest.json",
      "--install-dir",
      "/game",
      "--out",
      "/output/icons",
      "--engine",
      values["ue-version"],
      "--sizes",
      "256",
    ],
    output,
  );

  // Upstream exits zero on partial success, so check both its report and every PNG.
  const report: unknown = JSON.parse(
    await readFile(join(output, "icons/extraction-result.json"), "utf8"),
  );
  const hashes = reportedPngHashes(report, manifest);
  const invalid: string[] = [];
  for (const entry of manifest) {
    const file = `icons/256/${entry.objectName}.png`;
    try {
      // oxlint-disable-next-line no-await-in-loop -- Keep validation memory bounded to one image.
      const png = await readFile(join(output, file));
      if (
        hashes.get(entry.assetPath) !== createHash("sha256").update(png).digest("hex") ||
        png.length < 33 ||
        !png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
        png.toString("ascii", 12, 16) !== "IHDR" ||
        png.readUInt32BE(16) !== 256 ||
        png.readUInt32BE(20) !== 256
      )
        invalid.push(file);
    } catch {
      invalid.push(file);
    }
  }
  await writeJson("extraction.json", {
    ...metadata,
    status: invalid.length ? "incomplete" : "complete",
    invalid,
  });
  if (invalid.length) {
    throw new Error(
      `${invalid.length} missing or invalid PNGs. See ${join(output, "extraction.json")}.`,
    );
  }
  console.log(`Extracted and checked ${manifest.length} PNGs. Results: ${output}`);
}

async function requireFile(path: string, hint: string) {
  try {
    await access(path);
  } catch {
    throw new Error(`Cannot access ${path}. ${hint}`);
  }
}

async function run(command: string, args: string[], cwd: string, quiet = false) {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: quiet ? ["ignore", "ignore", "inherit"] : "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else
        reject(
          new Error(
            `${command} failed (${signal ?? code}). See docs/asset-extraction.md for setup. Output: ${cwd}`,
          ),
        );
    });
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
