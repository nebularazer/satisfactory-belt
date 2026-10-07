import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { expect, it } from "vitest";

const exec = promisify(execFile);

it("retains the cleanup PR for comment retries but stops cleanup when it becomes eligible again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pages-resolve-"));
  const eventPath = join(directory, "event.json");
  const pr42 = {
    number: 42,
    labels: [] as { name: string }[],
    head: { sha: "current", ref: "feat/example", repo: { full_name: "owner/repo" } },
  };
  const openPullRequests = [pr42, { ...pr42, number: 43, labels: [{ name: "preview" }] }];
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url?.startsWith("/repos/owner/repo/pulls?")) {
      response.end(JSON.stringify(openPullRequests));
    } else if (request.url === "/repos/owner/repo/commits/main") {
      response.end(JSON.stringify({ sha: "main-sha" }));
    } else {
      response.writeHead(404);
      response.end("{}");
    }
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address.");
    const port = address.port;
    await writeFile(
      eventPath,
      JSON.stringify({ repository: { default_branch: "main" }, pull_request: { number: 42 } }),
    );
    let attempt = 0;
    async function resolveOutput() {
      attempt += 1;
      const outputPath = join(directory, `output-${attempt}`);
      await exec(process.execPath, [fileURLToPath(new URL("./resolve.ts", import.meta.url))], {
        env: {
          ...process.env,
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
          GITHUB_API_URL: `http://127.0.0.1:${port}`,
          GITHUB_REPOSITORY: "owner/repo",
          GH_TOKEN: "test-token",
        },
      });
      return Object.fromEntries(
        (await readFile(outputPath, "utf8"))
          .trim()
          .split("\n")
          .map((line) => line.split("=")),
      );
    }
    expect(await resolveOutput()).toEqual({
      target: "",
      preview_pull_requests: "[43]",
      cleanup_pull_request: "42",
    });
    pr42.labels.push({ name: "preview" });
    expect(await resolveOutput()).toEqual({
      target: "",
      preview_pull_requests: "[42,43]",
      cleanup_pull_request: "",
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
