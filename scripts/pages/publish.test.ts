import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: "pipe" });

it("bootstraps gh-pages and publishes updates and merge cleanup without changing main", async () => {
  const root = await mkdtemp(join(tmpdir(), "pages-publish-"));
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const build = join(root, "build");
  const script = fileURLToPath(new URL("./publish.ts", import.meta.url));
  try {
    git("init", "--bare", "--initial-branch=main", remote);
    git("clone", remote, seed);
    git("-C", seed, "config", "user.name", "Pages test");
    git("-C", seed, "config", "user.email", "pages@example.com");
    await writeFile(join(seed, "source.txt"), "main source");
    git("-C", seed, "add", ".");
    git("-C", seed, "commit", "-m", "test: seed main");
    git("-C", seed, "push", "origin", "main");
    const mainSha = git("--git-dir", remote, "rev-parse", "main").trim();
    await mkdir(build);
    let attempt = 0;

    async function publish(target: string, previewPullRequests: number[], html?: string) {
      attempt += 1;
      const checkout = join(root, `checkout-${attempt}`);
      const site = join(root, `site-${attempt}`);
      git("clone", remote, checkout);
      if (html) await writeFile(join(build, "index.html"), html);
      execFileSync(process.execPath, [script], {
        cwd: checkout,
        stdio: "pipe",
        env: {
          ...process.env,
          PAGES_SITE_DIRECTORY: site,
          PAGES_BUILD_DIRECTORY: build,
          PAGES_TARGET: target,
          PAGES_PREVIEW_PULL_REQUESTS: JSON.stringify(previewPullRequests),
        },
      });
      expect(await readFile(join(site, ".nojekyll"), "utf8")).toBe("");
      await expect(readFile(join(site, ".git"))).rejects.toThrow();
      return site;
    }

    await publish("main", [], "main build");
    await publish("42", [42, 43], "PR 42");
    await publish("43", [42, 43], "PR 43");
    await publish("", [43]);
    const tree = git("--git-dir", remote, "ls-tree", "-r", "--name-only", "gh-pages");
    expect(tree).toContain("pr/43/index.html");
    expect(tree).not.toContain("pr/42/");
    expect(tree).not.toContain("source.txt");
    expect(git("--git-dir", remote, "show", "gh-pages:index.html")).toBe("main build");
    expect(git("--git-dir", remote, "show", "gh-pages:pr/43/index.html")).toBe("PR 43");
    const pagesSha = git("--git-dir", remote, "rev-parse", "gh-pages").trim();
    // A late build from the merged PR makes no new commit and still prepares a retryable upload.
    await publish("42", [43], "late PR 42");
    expect(git("--git-dir", remote, "rev-parse", "gh-pages").trim()).toBe(pagesSha);
    expect(git("--git-dir", remote, "rev-parse", "main").trim()).toBe(mainSha);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
