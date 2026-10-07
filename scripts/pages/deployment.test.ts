import { expect, it } from "vitest";

import { deploymentTarget } from "./deployment.ts";
import type { OpenPullRequest, PagesBuild } from "./deployment.ts";

const pullRequest: OpenPullRequest = {
  number: 42,
  head: { sha: "current", ref: "feat/example", repo: { full_name: "owner/repo" } },
};
const build: PagesBuild = {
  event: "pull_request",
  head_sha: "current",
  head_branch: "feat/example",
  head_repository: { full_name: "owner/repo" },
  pull_requests: [{ number: 42 }],
};

it("publishes the current PR build but ignores older commits and closed or merged PRs", () => {
  expect(deploymentTarget(build, "main", "main-sha", [pullRequest])).toBe("42");
  expect(deploymentTarget({ ...build, head_sha: "old" }, "main", "main-sha", [pullRequest])).toBe(
    "",
  );
  expect(deploymentTarget(build, "main", "main-sha", [])).toBe("");
  expect(deploymentTarget(undefined, "main", "main-sha", [pullRequest])).toBe("");
});

it("identifies fork builds even when GitHub omits the run's pull_requests association", () => {
  const fork = { ...pullRequest, head: { ...pullRequest.head, repo: { full_name: "fork/repo" } } };
  const forkBuild = { ...build, head_repository: { full_name: "fork/repo" }, pull_requests: [] };
  expect(deploymentTarget(forkBuild, "main", "main-sha", [fork])).toBe("42");
  expect(deploymentTarget(forkBuild, "main", "main-sha", [pullRequest])).toBe("");
  expect(deploymentTarget(forkBuild, "main", "main-sha", [fork, { ...fork, number: 43 }])).toBe("");
});

it("only updates the main site from the latest default-branch build", () => {
  const mainBuild = { ...build, event: "push", head_branch: "main", head_sha: "main-sha" };
  expect(deploymentTarget(mainBuild, "main", "main-sha", [])).toBe("main");
  expect(deploymentTarget(mainBuild, "main", "newer-sha", [])).toBe("");
  expect(
    deploymentTarget({ ...mainBuild, head_branch: "feat/example" }, "main", "main-sha", []),
  ).toBe("");
  expect(
    deploymentTarget({ ...mainBuild, event: "workflow_dispatch" }, "main", "main-sha", []),
  ).toBe("main");
});
