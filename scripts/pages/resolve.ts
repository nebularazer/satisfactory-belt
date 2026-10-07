import { appendFile, readFile } from "node:fs/promises";

import { deploymentTarget, hasPreviewLabel } from "./deployment.ts";
import type { OpenPullRequest, PagesBuild } from "./deployment.ts";
import { github } from "./github.ts";

const event: {
  repository: { default_branch: string };
  workflow_run?: PagesBuild;
} = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, "utf8"));
const defaultBranch = event.repository.default_branch;

const openPullRequests: OpenPullRequest[] = [];
for (let page = 1; ; page += 1) {
  // oxlint-disable-next-line no-await-in-loop -- Follow pagination until GitHub returns the last page.
  const batch = await github<OpenPullRequest[]>(
    `pulls?state=open&base=${encodeURIComponent(defaultBranch)}&per_page=100&page=${page}`,
  );
  openPullRequests.push(...batch);
  if (batch.length < 100) break;
}
const main = await github<{ sha: string }>(`commits/${encodeURIComponent(defaultBranch)}`);
const target = deploymentTarget(event.workflow_run, defaultBranch, main.sha, openPullRequests);
const previewPullRequests = openPullRequests.filter(hasPreviewLabel);
await appendFile(
  process.env.GITHUB_OUTPUT!,
  `target=${target}\npreview_pull_requests=${JSON.stringify(previewPullRequests.map((pr) => pr.number))}\n`,
);
