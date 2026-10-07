import { cp, lstat, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function validateBuild(directory: string, root = true): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error(`Unsupported build entry: ${entry.name}`);
    }
    if (entry.name.startsWith(".") || (root && ["pr", "CNAME"].includes(entry.name))) {
      throw new Error(`Reserved build entry: ${entry.name}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Validate one subtree at a time before modifying the site.
    if (entry.isDirectory()) await validateBuild(join(directory, entry.name), false);
  }
  if (root && !(await stat(join(directory, "index.html"))).isFile()) {
    throw new Error("The build must contain index.html.");
  }
}

export async function updateSite(
  directory: string,
  previewPullRequests: number[],
  build?: { directory: string; target: string },
): Promise<void> {
  const eligible = new Set(previewPullRequests.map(String));
  if (build) {
    if (build.target !== "main" && !/^[1-9]\d*$/.test(build.target)) {
      throw new Error(`Invalid preview number: ${build.target}`);
    }
    await validateBuild(build.directory);
  }
  await mkdir(directory, { recursive: true });
  const previews = join(directory, "pr");
  await mkdir(previews, { recursive: true });
  if ((await lstat(previews)).isSymbolicLink())
    throw new Error("The preview directory is a symlink.");

  if (build?.target === "main") {
    await Promise.all(
      (await readdir(directory))
        .filter((entry) => entry !== ".git" && entry !== "pr")
        .map((entry) => rm(join(directory, entry), { recursive: true, force: true })),
    );
    await Promise.all(
      (await readdir(build.directory)).map((entry) =>
        cp(join(build.directory, entry), join(directory, entry), { recursive: true }),
      ),
    );
  } else if (build && eligible.has(build.target)) {
    const destination = join(previews, build.target);
    await rm(destination, { recursive: true, force: true });
    await cp(build.directory, destination, { recursive: true });
  }

  // Reconcile every publish, including builds that became stale while waiting in the queue.
  await Promise.all(
    (await readdir(previews))
      .filter((entry) => !eligible.has(entry))
      .map((entry) => rm(join(previews, entry), { recursive: true, force: true })),
  );
  await writeFile(join(directory, ".nojekyll"), "");
}
