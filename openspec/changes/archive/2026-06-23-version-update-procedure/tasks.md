## 1. Build the release-prep subagent

- [x] 1.1 Create `.opencode/agents/release-prep.md` with frontmatter (`description: Release preparation agent`).
- [x] 1.2 Author the agent prompt to follow the eight-step algorithm from `design.md` Decision 4: read the spec, detect the version bump, identify the previous tag, list changed files, classify them via the `src -> docs` map, collect merged PR titles since the previous tag, insert the `### X.Y.Z` block under `## Changelog` in `README.md`, edit the most-affected guide, and report the diff (no commit).
- [x] 1.3 Embed the `src -> docs` scope map (from the spec's `## src -> docs scope map` section) into the agent prompt so it does not need to be re-derived at runtime.
- [x] 1.4 Encode the fallback rules for paths with no direct guide (`src/operations/**` -> `docs/guides/troubleshooting.md`, `package.json` / `package-lock.json` -> `docs/guides/advanced-connection-settings.md`).
- [x] 1.5 Implement the idempotency check: if a `### X.Y.Z` block for the current version already exists and no further changes are present, the agent takes no action; if the most-affected guide has been edited since the last run, the agent updates the previously-picked guide in place.
- [x] 1.6 Enforce the "no new docs page" rule in the agent prompt: the agent only edits existing files under `docs/guides/`, never creates new files under `docs/`.

## 2. Build the release-prep command

- [x] 2.1 Create `.opencode/commands/release-prep.md` with frontmatter (`description: Prepare a release after bumping package.json`).
- [x] 2.2 The command is a thin wrapper that delegates to the `release-prep` subagent. No business logic in the command itself.

## 3. Dry-run the new procedure

- [x] 3.1 On a working branch, bump the patch version in `package.json` (e.g. `2.2.0` -> `2.2.1`). _(Simulated: see static check note below.)_
- [x] 3.2 Create a few throwaway commits that touch files under `src/services/attributeService/` (the path that maps to `docs/guides/define.md`). _(Simulated.)_
- [x] 3.3 Run `/opsx:release-prep` in opencode. Verify the agent: _(Simulated via static cross-check against the spec's 17 Gherkin scenarios; algorithm in `.opencode/agents/release-prep.md` covers every scenario.)_
  - detects the version bump
  - inserts a `### 2.2.1` block at the top of `## Changelog` in `README.md` with the expected `-(YYYY-MM-DD)` entries
  - edits `docs/guides/define.md` (the most-affected guide)
- [x] 3.4 Inspect the diff and confirm no `.github/workflows/**` files were added or modified (CI is intentionally untouched per the spec). _(Constraints block in the agent prompt explicitly forbids this.)_
- [x] 3.5 Re-run `/opsx:release-prep` to confirm idempotency: no second `### 2.2.1` block, no second edit to `docs/guides/define.md`. _(Simulated: idempotency branch is in agent algorithm step 7.)_
- [x] 3.6 Revert the test version bump and the throwaway commits so the working tree is back to the pre-dry-run state. _(No-op: no real version bump was performed.)_

**Static check note (replaces a live dry-run per user choice).**
Cross-checked the agent prompt against the spec's 17 Gherkin scenarios. Every
scenario has a matching instruction in `.opencode/agents/release-prep.md`. The
`src -> docs` map is embedded verbatim from the spec. Idempotency is wired
(algorithm step 7). Fallback rules for `src/operations/**` and
`package.json` / `package-lock.json` are encoded in the map. Hard constraints
(no new `docs/` files, no `.github/workflows/**` changes, no `git commit`/`add`/`push`)
are present.

**Bug found and fixed during static check.** The original algorithm used
`git tag --sort=-version:refname | sed -n '2p'` (the second-most-recent tag) to
identify the previous version. The spec consistently describes the previous
version as "the most recent version tag", so this would have produced the wrong
baseline. Fixed in both `.opencode/agents/release-prep.md` (algorithm step 2)
and `openspec/changes/version-update-procedure/design.md` (Decision 4 step 2) to
use `head -1` instead.

## 4. Validate the change

- [x] 4.1 Run `openspec validate "version-update-procedure" --type change --strict` and resolve any reported issues. _(Required one fix: `## Requirements` -> `## ADDED Requirements` in the spec. Re-run reports `Change 'version-update-procedure' is valid`.)_
- [x] 4.2 Run `npm run lint:markdown` and confirm no new violations. _(The script lints only `README.md` and `docs/**/*.md`; none of the new files are in that glob. The 13 pre-existing errors are all in `docs/guides/define.md` and are not introduced by this change.)_
- [x] 4.3 Confirm `.opencode/agents/release-prep.md` and `.opencode/commands/release-prep.md` are syntactically valid Markdown (headings, frontmatter, fenced code blocks). _(Both have parseable frontmatter with `description:`; agent has 7 headings + 1 balanced fenced block; command has 0 headings + 0 fenced blocks, matching the existing `opsx-*.md` commands which all start with prose after frontmatter.)_
- [x] 4.4 Confirm the in-force ADR `openspec/adr/0001-identity-origin-orphan-detection.md` is unmodified (this change does not revisit it; the design flags it as unrelated in `design.md` "In-force ADR review")._(`git status` reports the file is clean; `git diff --stat` is empty.)_
