# GitHub Pages deployment

The publishing and PR preview workflows are an exception to the repository's
no-GitHub-CI policy. Other CI remains outside this setup.

## Initial setup

GitHub Actions must be enabled and **Settings → Pages → Build and deployment →
Source** must be **GitHub Actions**. These settings can also be configured with
`gh api`; the Pages API's publishing mode is `build_type: workflow`.
The `github-pages` environment must allow deployments
from `main`; both the publisher and closed-PR cleanup run trusted default-branch
code. Run **Build Pages** manually on `main` if its first build happened before
Pages was enabled. No additional token or secret is needed.

## URLs and lifecycle

- Main: `https://nebularazer.github.io/satisfactory-belt/`
- PR 42: `https://nebularazer.github.io/satisfactory-belt/pr/42/`

Pushes to `main` build the main app. PR previews require the **`preview` label**.
Adding it to a PR targeting `main` builds its head commit with the corresponding
Vite base path. Opening, updating, or reopening a labelled PR also builds its
preview. Other PRs skip the build. Fork PRs use the same label and build path,
subject to GitHub's workflow approval rules.

**Publish Pages** consumes the build artifact without executing its code. It only
checks out default-branch scripts, checks that the build still matches the current
commit, and writes static files to `gh-pages`. The combined site is then deployed
with the official Pages actions. After a successful PR deployment, the publisher
adds a comment linking to the preview and updates the same bot comment on later
deployments. It checks that the PR is still open, still has the `preview` label,
and its head commit still matches before commenting. Main deployments and preview
cleanup do not add comments.
The published preview link also appears in the publisher's job summary.

Removing the `preview` label or closing a PR, including merging it, queues a
publish that removes its directory. Every publish also removes directories whose
PRs are no longer open or labelled. The publisher rechecks current labels before
deploying, so a late build or rerun cannot restore an ineligible preview.
Main deployments preserve eligible previews, and PR deployments preserve the
main site and other eligible previews. Publishing
is queued with `queue: max` so pending updates and cleanups do not cancel each other.

The generated `gh-pages` branch holds deployment state only; do not merge it into
`main`. **Publish Pages** can also be run manually on `main` to retry deployment
of that state or reconcile ineligible previews. It does not rebuild the app.

Previews share the main site's origin, including its browser storage. Use exported
plan files when testing a change that affects saved-plan formats.

## Prepared asset bundle

`.github/pages/game-data.tar.gz` contains only the prepared catalog, icon manifest,
referenced WebP icons, and a completion marker. Builds unpack it and use the
existing `assets:stage` validation to check catalog references and icon sizes and
hashes. CI never downloads the game or needs Steam credentials.

To update the bundle, prepare and stage a completed asset run as described in
`docs/machine-node-design.md`, then package the staged files on Linux:

```bash
ASSET_BUNDLE_DIRECTORY=$(mktemp -d)
cp -R apps/web/public/game-data/. "$ASSET_BUNDLE_DIRECTORY/"
printf '%s\n' '{"status":"complete"}' > "$ASSET_BUNDLE_DIRECTORY/preparation.json"
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner \
  -czf .github/pages/game-data.tar.gz -C "$ASSET_BUNDLE_DIRECTORY" .
rm -rf "$ASSET_BUNDLE_DIRECTORY"
```

Commit the updated bundle with the corresponding code changes. Runtime assets
remain gitignored; only the deployment bundle is checked in.
