import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { updateSite } from "./site.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
  directories.length = 0;
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pages-test-"));
  directories.push(root);
  const site = join(root, "site");
  const build = join(root, "build");
  await mkdir(site);
  await mkdir(join(build, "assets"), { recursive: true });
  await writeFile(join(site, ".git"), "worktree metadata");
  await writeFile(join(site, "index.html"), "old main");
  await writeFile(join(build, "index.html"), "new build");
  await writeFile(join(build, "assets", "new.js"), "new bundle");
  return { root, site, build };
}

it("keeps other previews and main while updating one PR, then removes the merged preview", async () => {
  const { site, build } = await fixture();
  await updateSite(site, [42, 43], { directory: build, target: "42" });
  await writeFile(join(build, "index.html"), "other preview");
  await updateSite(site, [42, 43], { directory: build, target: "43" });
  expect(await updateSite(site, [43])).toEqual([42]);
  expect(await readdir(join(site, "pr"))).toEqual(["43"]);
  expect(await readFile(join(site, "index.html"), "utf8")).toBe("old main");
  expect(await readFile(join(site, "pr/43/index.html"), "utf8")).toBe("other preview");
  expect(await readFile(join(site, ".git"), "utf8")).toBe("worktree metadata");
  expect(await readFile(join(site, ".nojekyll"), "utf8")).toBe("");
  // A queued build completing after the merge must not bring PR 42 back.
  expect(await updateSite(site, [43], { directory: build, target: "42" })).toEqual([]);
  expect(await readdir(join(site, "pr"))).toEqual(["43"]);
});

it("replaces the main build without leaving old bundles or removing open previews", async () => {
  const { site, build } = await fixture();
  await mkdir(join(site, "assets"));
  await writeFile(join(site, "assets/old.js"), "old bundle");
  await updateSite(site, [42], { directory: build, target: "42" });
  await writeFile(join(build, "index.html"), "new main");
  await updateSite(site, [42], { directory: build, target: "main" });
  expect(await readFile(join(site, "index.html"), "utf8")).toBe("new main");
  expect(await readFile(join(site, "pr/42/index.html"), "utf8")).toBe("new build");
  expect(await readdir(join(site, "assets"))).toEqual(["new.js"]);
});

it("rejects builds that could overwrite another preview or the publisher's Git metadata", async () => {
  const { site, build } = await fixture();
  await mkdir(join(build, "pr"));
  await expect(updateSite(site, [42], { directory: build, target: "main" })).rejects.toThrow(
    "Reserved",
  );
  await rm(join(build, "pr"), { recursive: true });
  await symlink(join(site, ".git"), join(build, "assets/linked-file"));
  await expect(updateSite(site, [42], { directory: build, target: "42" })).rejects.toThrow(
    "Unsupported",
  );
  await rm(join(build, "assets/linked-file"));
  await expect(updateSite(site, [42], { directory: build, target: "../other" })).rejects.toThrow(
    "Invalid",
  );
  expect(await readFile(join(site, "index.html"), "utf8")).toBe("old main");
  expect(await readFile(join(site, ".git"), "utf8")).toBe("worktree metadata");
});
