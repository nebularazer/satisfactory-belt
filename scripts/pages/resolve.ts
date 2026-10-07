import { appendFile, readFile } from "node:fs/promises";

import { deploymentTarget } from "./deployment.ts";
import type { OpenPullRequest, PagesBuild } from "./deployment.ts";

const repository = process.env.GITHUB_REPOSITORY!;
const event: {
  repository: { default_branch: string };
  workflow_run?: PagesBuild;
} = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, "utf8"));
const defaultBranch = event.repository.default_branch;

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${process.env.GITHUB_API_URL}/repos/${repository}/${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${path}: ${response.status}`);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Callers supply the schema for the trusted GitHub REST endpoint.
  return (await response.json()) as T;
}

const openPullRequests: OpenPullRequest[] = [];
for (let page = 1; ; page += 1) {
  // oxlint-disable-next-line no-await-in-loop -- Follow pagination until GitHub returns the last page.
  const batch = await get<OpenPullRequest[]>(
    `pulls?state=open&base=${encodeURIComponent(defaultBranch)}&per_page=100&page=${page}`,
  );
  openPullRequests.push(...batch);
  if (batch.length < 100) break;
}
const main = await get<{ sha: string }>(`commits/${encodeURIComponent(defaultBranch)}`);
const target = deploymentTarget(event.workflow_run, defaultBranch, main.sha, openPullRequests);
await appendFile(
  process.env.GITHUB_OUTPUT!,
  `target=${target}\nopen_pull_requests=${JSON.stringify(openPullRequests.map((pr) => pr.number))}\n`,
);
