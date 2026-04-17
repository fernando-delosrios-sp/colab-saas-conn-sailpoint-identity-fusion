# Contributing to documentation

The public site is built with [MkDocs](https://www.mkdocs.org/) and the [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) theme. Configuration lives in `mkdocs.yml` at the repository root; markdown and assets live under `docs/`.

## Generated files

Do not edit these by hand; they are produced before each build:

| Output | Producer |
| ------ | -------- |
| `docs/home.md` | `scripts/sync-docs-home.cjs` (copies the root `README.md` with link rewrites for `docs_dir`) |
| `docs/LICENSE.txt` | `scripts/copy-license-for-docs.cjs` (copies the root license so MkDocs can validate `home.md` links) |

Run `npm run docs:prepare` to regenerate both, or use `npm run docs:build` / `npm run docs:serve`, which call `docs:prepare` first.

## Optional local toolchain

If you want to build or serve the site on your machine:

1. `npm run docs:install` — creates `.venv` and installs `requirements-docs.txt`.
2. `npm run docs:build` — prepares generated files and runs `mkdocs build` (output in `site/`).
3. `npm run docs:serve` — prepares generated files and runs `mkdocs serve` for a local preview.

Continuous deployment uses Python and MkDocs on GitHub Actions (see `.github/workflows/deploy-docs-pages.yml`); a local install is not required to publish.

## Authoring tips

- Link to other pages with **relative** paths from the current file (for example from `docs/guides/foo.md` to the home page: `../home.md`).
- Put shared images under `docs/assets/images/` and reference them from guides as `../assets/images/...`.
- After changing the root `README.md`, run `docs:prepare` so `docs/home.md` stays in sync.
