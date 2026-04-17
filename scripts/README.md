# Scripts

## Documentation (MkDocs)

These scripts prepare the `docs/` tree for MkDocs and optional local builds.

| Script | Purpose |
| ------ | ------- |
| `prepare-docs.cjs` | Runs `sync-docs-home.cjs` then `copy-license-for-docs.cjs` (used by `npm run docs:prepare`). |
| `sync-docs-home.cjs` | Writes `docs/home.md` from the root `README.md`, rewriting `](docs/` links to `](./` so they resolve inside `docs_dir`. |
| `copy-license-for-docs.cjs` | Copies `LICENSE.txt` into `docs/LICENSE.txt` so the synced home page can link to it for MkDocs validation. |
| `docs-venv.cjs` | Creates or uses `.venv`, installs `requirements-docs.txt`, and runs `mkdocs build` or `mkdocs serve`. |

Publishing to GitHub Pages is handled in CI (`.github/workflows/deploy-docs-pages.yml`); use `npm run docs:*` only if you want a local virtualenv and preview.
