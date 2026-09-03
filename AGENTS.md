# Repository instructions

## Git conventions

- Name branches using `<type>/<short-kebab-case-description>`, for example
  `feat/recipe-planner` or `fix/canvas-zoom`. Use Conventional Commit types such
  as `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, and `ci`.
- Write commit messages using Conventional Commits:
  `<type>(optional-scope): <imperative summary>`.
- Give pull requests a Conventional Commit title that describes the final
  change delivered by the PR.
- Merge pull requests with squash merge. The squash commit title must follow
  Conventional Commits and summarize the final behavior, not intermediate work.
- Do not use merge commits or rebase merges unless a maintainer explicitly asks
  for a different strategy.
