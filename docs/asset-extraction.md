# Extracting Satisfactory assets

Run commands from the repository root unless a command explicitly changes directories.
Downloads, tool binaries and extracted assets belong in the gitignored
`.assets/` directory. Nothing is imported into the application yet.

The workflow is manual setup/download followed by `pnpm assets:extract`. An existing
Satisfactory installation can be used with `--game-dir /path/to/Satisfactory`, skipping
the Steam download steps.

## 1. Install the tools once

The commands below target Linux ARM64 or x64 and need Node 24, pnpm, Docker, Git, curl and unzip.
Check the host architecture with `uname -m`: use `arm64` for `aarch64`, or `x64` for
`x86_64`. This is the tool architecture; we download the Windows game depot on either host.

```bash
ASSET_ARCH=arm64
mkdir -p .assets/tools .assets/download .assets/extracted
pnpm install

curl -fL "https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_3.4.0/DepotDownloader-linux-${ASSET_ARCH}.zip" \
  -o .assets/tools/depotdownloader.zip
unzip -q .assets/tools/depotdownloader.zip -d .assets/tools/depotdownloader
chmod +x .assets/tools/depotdownloader/DepotDownloader
.assets/tools/depotdownloader/DepotDownloader --version
```

For image export we run the standalone `extractor-net` component from
[SatisfactoryTools/AssetsExtractor](https://github.com/SatisfactoryTools/AssetsExtractor)
in Docker. Docker must be installed and running (`docker version` should show a server).
.NET and its libraries stay inside the image; no host SDK, Windows tool patch, PHP or
database is needed.

Build it once from the pinned upstream commit:

```bash
git clone https://github.com/SatisfactoryTools/AssetsExtractor.git .assets/tools/satisfactory-tools
git -C .assets/tools/satisfactory-tools checkout --detach baa45041da5d6d43987638836c650d67b8f1267d
docker build -f scripts/assets/Dockerfile -t satisfactory-assets:baa4504 \
  .assets/tools/satisfactory-tools/extractor-net
```

The Dockerfile compiles the upstream extractor source without code patches. It pins
`Microsoft.Bcl.Memory` to 9.0.14 to fix an upstream transitive dependency affected by
[CVE-2026-26127](https://github.com/advisories/GHSA-73j8-2gch-69rq).
The .NET 10 Ubuntu base images follow their servicing tags; rebuild with `--pull` to
refresh them. Downloads and image builds need network access; extraction runs offline
with the game directory mounted read-only and output files owned by your current user.
Docker's images/build cache live in Docker's own storage, outside `.assets/`.

Later runs reuse the existing tools and image. Linux ARM64 is validated; other
platforms have not been tested.

## 2. Log into Steam and inspect the manifest

Use a Steam account that owns Satisfactory. Authentication happens in your terminal.
Replace `YOUR_STEAM_USERNAME` below; DepotDownloader prompts for the password and
Steam Guard authentication. Add `-no-mobile` to enter a Steam Guard code instead of
approving a mobile notification. Do not put your password in the command.

```bash
.assets/tools/depotdownloader/DepotDownloader \
  -app 526870 -depot 526871 -os windows -username YOUR_STEAM_USERNAME \
  -manifest-only -dir "$PWD/.assets/download"
```

This fetches metadata, not the game containers. It writes
`.assets/download/manifest_526871_<MANIFEST_ID>.txt`. Record that manifest ID and
inspect the listed paths and sizes:

```bash
rg 'CommunityResources|FactoryGame/Content/Paks' .assets/download/manifest_526871_*.txt
```

Alternatively, replace `-username YOUR_STEAM_USERNAME` with `-qr` to scan a terminal
QR code with the Steam mobile app. Use the username flow if scanning is inconvenient.

The download [allowlist](../scripts/assets/steam-files.txt) selects:

- `CommunityResources/Docs/en-US.json`: the complete English data dump, already
  loose on disk. This replaces the older `Docs.json` filename.
- `CommunityResources/FactoryGame.usmap` and `CustomVersions.json`: matching
  Unreal mappings and custom serialization versions.
- The `.pak`, `.utoc` and `.ucas` containers under `FactoryGame/Content/Paks`,
  including any split `.ucas` partitions and global containers.

Steam filtering works at the depot-file level. Icons inside a large `.ucas` file
still require that whole file; extraction selects the textures after downloading.
The allowlist excludes executables, videos and other loose game files. Review it
against the manifest when the game's packaging changes.

Manifest `4522661880264054134` was inspected on 2026-09-14: this allowlist selects
eight files totaling 9.61 GiB on disk, compared with 28.12 GiB for the full depot.

## 3. Download the selected files

Replace the placeholder with the ID from step 2. Pinning it keeps the JSON, mappings
and archives from the same build even if Steam publishes an update between commands.

```bash
ASSET_MANIFEST=REPLACE_WITH_MANIFEST_ID
test -s scripts/assets/steam-files.txt && \
  .assets/tools/depotdownloader/DepotDownloader \
    -app 526870 -depot 526871 -os windows -username YOUR_STEAM_USERNAME \
    -manifest "$ASSET_MANIFEST" \
    -filelist "$PWD/scripts/assets/steam-files.txt" \
    -dir "$PWD/.assets/download" -validate
```

Use absolute `-filelist` and `-dir` paths, as above, to avoid downloading into a
different folder when launching the tool from its own directory.

Complete Steam authentication again when prompted. To reuse a session, add
`-remember-password` at the initial login and subsequent invocations. Adding it
only after a nonpersistent login can fail with `Access token was rejected (AccessDenied)`;
run without the flag to authenticate again. DepotDownloader stores account state
in .NET's per-user isolated storage (under `~/.local/share/IsolatedStorage` on this
Linux host), independently of the working directory. It is outside this repository.

To fetch only the small community files first, create a temporary allowlist and use
`-filelist "$PWD/.assets/community-files.txt"` in the command above:

```bash
rg '^CommunityResources/' scripts/assets/steam-files.txt > .assets/community-files.txt
```

For another language, copy the allowlist into `.assets/`, replace `en-US.json` with
the desired file from the manifest, and pass that local allowlist to DepotDownloader.
The Steam `-language` option does not select among these JSON files.

## 4. Extract

```bash
pnpm assets:extract
```

Or use an existing installation, another locale, or just the downloaded JSON:

```bash
pnpm assets:extract --game-dir /path/to/Satisfactory
pnpm assets:extract --locale de
pnpm assets:extract --docs-only
```

Each run prints a fresh output directory under `.assets/extracted/<locale>-<suffix>/`:

- `docs.json`: the full game data in UTF-8, preserving all fields and values.
- `icons.json`: descriptor class names mapped to original Unreal references and PNG paths.
- `image-manifest.json`: the deduplicated Unreal object paths passed to the exporter.
- `icons/256/`: 256×256 PNGs, named by texture object plus a hash of its full asset path
  to avoid collisions between packages.
- `icons/extraction-result.json`: upstream per-texture results, original dimensions
  and output hashes.
- `extraction.json`: source JSON hash, engine setting, counts and completion status.

The selector uses `mPersistentBigIcon`, falling back to `mSmallIcon`, for every
descriptor with an icon. This includes item, resource and building icons. It exports
one resolution per descriptor and deduplicates shared textures. The upstream exporter
resizes every selected texture to 256×256, including larger building icons; original
dimensions remain in its result report. It does not export
world textures, meshes or audio. Descriptors with no icon are skipped; unexpected
nonempty references fail with their class name so schema changes are visible.

The default engine setting is `GAME_UE5_6`, following the current
[Satisfactory extraction guide](https://docs.ficsit.app/satisfactory-modding/latest/Development/ExtractGameFiles.html).
Override it with `--ue-version GAME_UE5_...` if the downloaded build uses another version.
`--image NAME:TAG` selects another Docker image with the same extractor interface.

The command checks the upstream result counts and every expected PNG's signature,
256×256 dimensions and SHA-256 hash. Missing or invalid
exports cause a nonzero exit and leave the run marked `incomplete`. A `docs-only`
run writes the selection but does not claim to have exported images. Previous runs
and source downloads are preserved, so stale PNGs cannot hide a failed new extraction.

## 5. Prepare the game catalog and WebP icons

Use the completed output directory printed by step 4. Preparation runs locally with
Node/tsx and Sharp (installed by `pnpm install`); Docker and Steam are not involved.

```bash
pnpm assets:prepare --input .assets/extracted/REPLACE_WITH_COMPLETED_RUN --compare
```

For the extraction validated here:

```bash
pnpm assets:prepare --input .assets/extracted/en-US-WSmSpy --compare
```

`--compare` adds a size comparison against PNG and lossless WebP using the same
resized pixels. Omit it for subsequent runs to avoid the extra encoding work.
`--encoding lossless` preserves visible pixels exactly; the default is `quality90`.
Both modes preserve the alpha channel. Encoding uses effort 6; quality90 also uses
high-quality chroma subsampling and alpha quality 100. Raw extracted PNGs remain available.

Every run creates a new gitignored `.assets/prepared/<locale>-<suffix>/` directory:

- `catalog.json`: compact items, manufacturing machines and automated recipes,
  keyed by game class ID, with locale and source JSON SHA-256.
- `icons.json`: icon IDs mapped to WebP variants at 64, 128 and 256 pixels, including
  relative paths, dimensions, byte sizes and SHA-256 hashes.
- `icons/<sha256>.webp`: files named by their encoded content. Identical decoded
  source pixels share one icon ID; matching encoded variants share one file.
- `preparation.json`: completion status, source extraction metadata, encoder versions,
  size totals/comparison and excluded recipe IDs with reasons.

The reusable types and semantic validator live in `packages/game-data`, exported as
`@satisfactory-belt/game-data`. The package has no browser or image-encoding dependency.
Generated data and image files stay under `.assets/` for now; the web app does not
import them. Steam access is only needed when obtaining new source files.

An item's or machine's `iconId` indexes `icons.json`'s `icons` object. Its `variants`
object has keys `64`, `128`, and `256`. Paths are relative to the prepared directory;
choosing public URLs, `srcset`, lazy loading and Pixi texture loading belongs to UI
integration later. Smaller variants reduce the pixels that need decoding; WebP
compression alone does not reduce GPU texture memory.

### Catalog scope and units

- All descriptors with solid, liquid or gas form are included as items. Building
  descriptors supply machine icons; decorative building assets are not copied.
- Recipes are included when they list a known `FGBuildableManufacturer` or
  `FGBuildableManufacturerVariablePower`. Handcrafting and building-cost recipes
  are excluded with reasons in the report. Unknown producers fail preparation so
  new machine types cannot be silently discarded.
- Ingredients and all products retain their per-cycle quantities. Solids use pieces;
  liquids **and gases** are divided by 1000 to use cubic metres, consistent with
  [SatisfactoryTools' parser](https://github.com/greeny/SatisfactoryTools/blob/dev/bin/parseDocs.ts).
  Recipe duration is in seconds. For example, Pure Iron Ingot consumes 4 m³ of water
  per 12-second cycle; the source value is 4000.
- The catalog retains alternate-recipe flags from Unreal asset paths and recipe event
  IDs such as `EV_Christmas`, independently of translated display names. It does not
  apply milestone/research unlocks or filter by the current event/date.
- Fixed machine power is in MW. Variable-power machines are explicitly marked and
  recipes retain the source constant/factor parameters; zero base power is not
  presented as free operation. Power simulation and clock-speed behavior are later work.
- Mining, water/oil extraction, power generation and the FICSMAS gift producer use
  different game systems and are not synthesized into manufacturing recipes here.
  The full source JSON is preserved for extending the model later.

The current dump has 195 items, 291 manufacturing recipes and 11 manufacturing
machines; 581 other `FGRecipe` entries are excluded. Data validation checks quantities,
durations, units, and every item/machine/icon reference. Source PNG hashes are checked
against the extraction report; each generated WebP is fully decoded to validate its
size and unchanged transparency. Four workers bound image-processing concurrency.
Failures leave the run marked `incomplete`; a failed run must not be consumed.

## Updating and troubleshooting

- For a new game build, repeat manifest inspection and download into a fresh directory
  (for example `.assets/download-next`), then use `--game-dir .assets/download-next`.
  This avoids leaving old patch containers mixed with new ones.
- Missing files: check the manifest, allowlist and download directory. DepotDownloader
  can continue after an unreadable filelist, so the download command checks it first.
- Archive/parser errors: confirm all container companions, mappings and custom versions
  came from the same manifest, and check the Unreal engine version before updating tools.
- Docker errors: check `docker version`, then build the image from step 1. Use a local
  Docker daemon so the repository bind mounts are accessible. Mount paths containing
  commas, double quotes or newlines are not supported.
- `usmap unparseable` warning: the pinned extractor falls back without mappings. All
  741 selected textures from the tested build decoded successfully with that fallback.
  This does not establish support for other Unreal asset types.
- PNG failures: inspect the exporter log and `extraction.json`; a successful upstream
  process exit alone does not establish a successful export.

## Validation status

Validated on Debian Linux ARM64 with Steam manifest `4522661880264054134`:

- The eight selected game files are downloaded (9.61 GiB).
- The real English JSON is decoded intact: 747 descriptors reference 741 unique textures.
- The Docker extractor mounted 48,573 files and exported all 741 selected textures
  with zero failures, using `GAME_UE5_6` and the upstream mapping fallback.
- Iron Plate and Constructor samples were visually inspected.

Preparation of that extraction was also validated on this host:

- 195 items, 291 recipes and 11 machines; 206 descriptor references resolve to
  203 unique image contents and 609 WebP files.
- Quality-90 WebP totals **4.61 MiB across all three sizes**. The comparison below
  uses the same 203 images and resized pixels in each format (bytes):

| Size |       PNG | Lossless WebP | Quality-90 WebP |
| ---- | --------: | ------------: | --------------: |
| 64   | 1,498,626 |     1,118,908 |         564,768 |
| 128  | 5,006,609 |     3,121,702 |       1,370,216 |
| 256  | 9,593,437 |     6,358,900 |       2,904,048 |

- All 609 written files were read back, fully decoded and checked against their
  manifest hashes, dimensions and byte sizes. The converter also checked alpha
  preservation against the resized source pixels.
- Representative quality-90/lossless samples were visually compared. Quality 90
  was selected for its smaller files; it introduces small color/detail differences.
- 18 focused tests passed for extraction, Unreal field parsing, catalog semantics,
  partial-export rejection, deduplication and image conversion. Type, lint and
  formatting checks passed. Incomplete extraction inputs are rejected.

The extraction wrapper also checks each output against the upstream report. A fresh
output directory prevents old PNGs from masking failures. The original game JSON and
Steam downloads remain in `.assets/`; no extracted assets are imported into the app.

Tool references: [DepotDownloader](https://github.com/SteamRE/DepotDownloader),
[SatisfactoryTools extractor source](https://github.com/SatisfactoryTools/AssetsExtractor/tree/baa45041da5d6d43987638836c650d67b8f1267d/extractor-net).
