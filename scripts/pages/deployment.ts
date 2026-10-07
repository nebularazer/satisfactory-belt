export interface OpenPullRequest {
  number: number;
  head: { sha: string; ref: string; repo: { full_name: string } | null };
}

export interface PagesBuild {
  event: string;
  head_sha: string;
  head_branch: string;
  head_repository: { full_name: string };
  pull_requests: { number: number }[];
}

/** A late or rerun build must not replace newer code or resurrect a closed preview. */
export function deploymentTarget(
  build: PagesBuild | undefined,
  defaultBranch: string,
  mainSha: string,
  openPullRequests: OpenPullRequest[],
): string {
  if (!build) return "";
  if (build.event === "push" || build.event === "workflow_dispatch") {
    return build.head_branch === defaultBranch && build.head_sha === mainSha ? "main" : "";
  }
  if (build.event !== "pull_request") return "";
  const matches = openPullRequests.filter(
    (pr) =>
      pr.head.sha === build.head_sha &&
      pr.head.ref === build.head_branch &&
      pr.head.repo?.full_name === build.head_repository.full_name &&
      (build.pull_requests.length === 0 ||
        build.pull_requests.some(({ number }) => number === pr.number)),
  );
  return matches.length === 1 ? String(matches[0]!.number) : "";
}
