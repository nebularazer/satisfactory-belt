import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { commentOnPreview } from "./comment.ts";

const marker = "<!-- satisfactory-belt-pages-preview -->";
const siteUrl = "https://owner.github.io/repo/";
const body = `${marker}\nPreview deployed: [Open preview](https://owner.github.io/repo/pr/42/)`;
const fetchMock = vi.fn<typeof fetch>();

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
    .mockResolvedValueOnce(response({ state: "open", head: { sha: "current" } }))
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
    .mockResolvedValueOnce(response({ state: "open", head: { sha: "current" } }))
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

it("does not comment for main, cleanup, closed or merged PRs, or a newer PR commit", async () => {
  await commentOnPreview("main", siteUrl, "current");
  await commentOnPreview("", siteUrl, "current");
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock
    .mockResolvedValueOnce(response({ state: "closed", head: { sha: "current" } }))
    .mockResolvedValueOnce(response({ state: "open", head: { sha: "newer" } }));
  await commentOnPreview("42", siteUrl, "current");
  await commentOnPreview("42", siteUrl, "current");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it("fails visibly if GitHub refuses to create the comment", async () => {
  fetchMock
    .mockResolvedValueOnce(response({ state: "open", head: { sha: "current" } }))
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ message: "Forbidden" }, 403));
  await expect(commentOnPreview("42", siteUrl, "current")).rejects.toThrow(
    "GitHub API issues/42/comments: 403",
  );
});
