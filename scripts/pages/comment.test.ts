import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { commentOnPreview, markPreviewRemoved } from "./comment.ts";

const marker = "<!-- satisfactory-belt-pages-preview -->";
const siteUrl = "https://owner.github.io/repo/";
const body = `${marker}\nPreview deployed: [Open preview](https://owner.github.io/repo/pr/42/)`;
const fetchMock = vi.fn<typeof fetch>();
const pullRequest = {
  state: "open",
  head: { sha: "current" },
  labels: [{ name: "preview" }],
  base: { ref: "main" },
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GITHUB_API_URL", "https://api.github.com");
  vi.stubEnv("GITHUB_REPOSITORY", "owner/repo");
  vi.stubEnv("GH_TOKEN", "test-token");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
});

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

it("creates a preview comment after a current, open PR deployment without modifying user comments", async () => {
  fetchMock
    .mockResolvedValueOnce(response(pullRequest))
    .mockResolvedValueOnce(response([{ id: 1, body: marker, user: { login: "contributor" } }]))
    .mockResolvedValueOnce(response({ id: 2 }));
  await commentOnPreview("42", siteUrl, "current");
  expect(fetchMock).toHaveBeenLastCalledWith(
    "https://api.github.com/repos/owner/repo/issues/42/comments",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ body }) }),
  );
});

it("updates the same bot comment on later deployments, including beyond the first page", async () => {
  fetchMock
    .mockResolvedValueOnce(response(pullRequest))
    .mockResolvedValueOnce(
      response(Array.from({ length: 100 }, (_, id) => ({ id, body: "review" }))),
    )
    .mockResolvedValueOnce(
      response([{ id: 123, body: marker, user: { login: "github-actions[bot]" } }]),
    )
    .mockResolvedValueOnce(response({ id: 123 }));
  await commentOnPreview("42", siteUrl.replace(/\/$/, ""), "current");
  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    "https://api.github.com/repos/owner/repo/issues/42/comments?per_page=100&page=2",
    expect.anything(),
  );
  expect(fetchMock).toHaveBeenLastCalledWith(
    "https://api.github.com/repos/owner/repo/issues/comments/123",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ body }) }),
  );
});

it("does not comment for main, cleanup, closed, merged or unlabelled PRs, or newer commits", async () => {
  await commentOnPreview("main", siteUrl, "current");
  await commentOnPreview("", siteUrl, "current");
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock
    .mockResolvedValueOnce(response({ ...pullRequest, state: "closed" }))
    .mockResolvedValueOnce(response({ ...pullRequest, head: { sha: "newer" } }))
    .mockResolvedValueOnce(response({ ...pullRequest, labels: [] }));
  await commentOnPreview("42", siteUrl, "current");
  await commentOnPreview("42", siteUrl, "current");
  await commentOnPreview("42", siteUrl, "current");
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it("fails visibly if GitHub refuses to create the comment", async () => {
  fetchMock
    .mockResolvedValueOnce(response(pullRequest))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ message: "Forbidden" }, 403));
  await expect(commentOnPreview("42", siteUrl, "current")).rejects.toThrow(
    "GitHub API issues/42/comments: 403",
  );
});

it.each([
  { ...pullRequest, state: "closed" },
  { ...pullRequest, labels: [] },
  { ...pullRequest, base: { ref: "other-branch" } },
])("replaces the dead preview link after cleanup: %j", async (pr) => {
  fetchMock
    .mockResolvedValueOnce(response(pr))
    .mockResolvedValueOnce(response([{ id: 123, body, user: { login: "github-actions[bot]" } }]))
    .mockResolvedValueOnce(response({ id: 123 }));
  await markPreviewRemoved("42", "main");
  expect(fetchMock).toHaveBeenLastCalledWith(
    "https://api.github.com/repos/owner/repo/issues/comments/123",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ body: `${marker}\nPreview removed.` }),
    }),
  );
});

it("leaves the comment active if the PR is reopened or relabelled before cleanup finishes", async () => {
  fetchMock.mockResolvedValueOnce(response(pullRequest));
  await markPreviewRemoved("42", "main");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("does not add a removal comment to a PR that never had a preview", async () => {
  fetchMock
    .mockResolvedValueOnce(response({ ...pullRequest, labels: [] }))
    .mockResolvedValueOnce(response([{ id: 1, body: marker, user: { login: "contributor" } }]));
  await markPreviewRemoved("42", "main");
  expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});
