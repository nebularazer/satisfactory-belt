import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hasPreviewLabel } from "./deployment.ts";
import { github } from "./github.ts";

const marker = "<!-- satisfactory-belt-pages-preview -->";
interface Comment {
  id: number;
  body: string | null;
  user: { login: string } | null;
}

async function findPreviewComment(target: string): Promise<Comment | undefined> {
  for (let page = 1; ; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Find the existing bot comment across GitHub's paginated results.
    const comments = await github<Comment[]>(`issues/${target}/comments?per_page=100&page=${page}`);
    const existing = comments.find(
      (comment) => comment.user?.login === "github-actions[bot]" && comment.body?.includes(marker),
    );
    if (existing || comments.length < 100) return existing;
  }
}

export async function commentOnPreview(
  target: string,
  siteUrl: string,
  sha: string,
): Promise<void> {
  if (!target || target === "main") return;
  if (!/^[1-9]\d*$/.test(target)) throw new Error(`Invalid preview number: ${target}`);

  // A PR can close, lose its label, or receive a newer commit during deployment.
  const pr = await github<{ state: string; head: { sha: string }; labels: { name: string }[] }>(
    `pulls/${target}`,
  );
  if (pr.state !== "open" || pr.head.sha !== sha || !hasPreviewLabel(pr)) return;
  const previewUrl = new URL(`pr/${target}/`, `${siteUrl.replace(/\/+$/, "")}/`).href;
  const body = `${marker}\nPreview deployed: [Open preview](${previewUrl})`;

  const existing = await findPreviewComment(target);
  if (existing) {
    await github(`issues/comments/${existing.id}`, { method: "PATCH", body: { body } });
  } else {
    await github(`issues/${target}/comments`, { method: "POST", body: { body } });
  }
}

export async function markPreviewRemoved(target: string, defaultBranch: string): Promise<void> {
  if (!/^[1-9]\d*$/.test(target)) throw new Error(`Invalid preview number: ${target}`);
  const pr = await github<{ state: string; labels: { name: string }[]; base: { ref: string } }>(
    `pulls/${target}`,
  );
  // A queued cleanup must not replace the comment after a PR is reopened or relabelled.
  if (pr.state === "open" && hasPreviewLabel(pr) && pr.base.ref === defaultBranch) return;
  const existing = await findPreviewComment(target);
  const body = `${marker}\nPreview removed.`;
  if (existing && existing.body !== body) {
    await github(`issues/comments/${existing.id}`, { method: "PATCH", body: { body } });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const removed: number[] = JSON.parse(process.env.PAGES_REMOVED_PULL_REQUESTS!);
  const targets = new Set(removed.map(String));
  if (process.env.PAGES_CLEANUP_PULL_REQUEST) targets.add(process.env.PAGES_CLEANUP_PULL_REQUEST);
  for (const target of targets) {
    // oxlint-disable-next-line no-await-in-loop -- Update each removed preview's existing comment in order.
    await markPreviewRemoved(target, process.env.PAGES_DEFAULT_BRANCH!);
  }
  await commentOnPreview(
    process.env.PAGES_TARGET!,
    process.env.PAGES_SITE_URL!,
    process.env.PAGES_SHA!,
  );
}
