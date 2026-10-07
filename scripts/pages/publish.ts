import { execFileSync, spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";

import { updateSite } from "./site.ts";

const directory = process.env.PAGES_SITE_DIRECTORY!;
const remote = execFileSync("git", ["ls-remote", "origin", "refs/heads/gh-pages"], {
  encoding: "utf8",
});
function git(...args: string[]) {
  execFileSync("git", args, { stdio: "inherit" });
}

if (remote.trim()) {
  git("fetch", "origin", "gh-pages");
  git("worktree", "add", "--detach", directory, "FETCH_HEAD");
} else {
  git("worktree", "add", "--detach", directory, "HEAD");
  git("-C", directory, "switch", "--orphan", "gh-pages");
}

const target = process.env.PAGES_TARGET;
const previewPullRequests: number[] = JSON.parse(process.env.PAGES_PREVIEW_PULL_REQUESTS!);
await updateSite(
  directory,
  previewPullRequests,
  target ? { directory: process.env.PAGES_BUILD_DIRECTORY!, target } : undefined,
);
git("-C", directory, "config", "user.name", "github-actions[bot]");
git(
  "-C",
  directory,
  "config",
  "user.email",
  "41898282+github-actions[bot]@users.noreply.github.com",
);
git("-C", directory, "add", "--all");
const diff = spawnSync("git", ["-C", directory, "diff", "--cached", "--quiet"]);
if (diff.status === 1) {
  git("-C", directory, "commit", "-m", "chore: update Pages deployments");
  git("-C", directory, "push", "origin", "HEAD:refs/heads/gh-pages");
} else if (diff.status !== 0) {
  throw new Error("Unable to inspect the staged Pages changes.");
}
// The upload contains only the site, without the worktree's Git metadata.
await rm(`${directory}/.git`);
