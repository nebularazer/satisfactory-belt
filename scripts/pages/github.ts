export async function github<T>(
  path: string,
  options?: { method: "POST" | "PATCH"; body: unknown },
): Promise<T> {
  const response = await fetch(
    `${process.env.GITHUB_API_URL}/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
    {
      method: options?.method,
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: options ? JSON.stringify(options.body) : undefined,
    },
  );
  if (!response.ok) throw new Error(`GitHub API ${path}: ${response.status}`);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Callers supply the schema for the trusted GitHub REST endpoint.
  return (await response.json()) as T;
}
