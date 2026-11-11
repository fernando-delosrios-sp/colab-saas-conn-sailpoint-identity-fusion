## Context

The connector package that ISC installs is a zip containing exactly two files: `dist/index.js` (the ncc bundle) and the repo-root `connector-spec.json`. ISC renders the Developer Settings `sectionHelpMessage` from that JSON, and it is the only place the UI shows a version. Today that message interpolates `package.json` `version` (`2.2.0`), so every package built from any commit under `2.2.0` looks identical in a tenant.

Constraints found while exploring:

- `npm run pack-zip` is `spcx package`; npm runs `prepack-zip` (`npm ci && npm run build`) first, and `npm run build` runs `prebuild`, which already rewrites `connector-spec.json` (`sync-connector-spec-initial-values.cjs`).
- `spcx package` reads `connector-spec.json` from the repo root, so the stamp must be in the file before the CLI runs.
- `scripts/check-connector-spec-help.cjs` (run by `npm run lint`) asserts the committed Developer Settings help contains `package.json` `version`, subject to a 1000-character and 10-sentence limit. The current message is 502 characters.
- `parse → JSON.stringify(spec, null, 4) + "\n"` reproduces the committed `connector-spec.json` byte-for-byte, so a stamped copy is a clean single-sentence diff and a restore can write the original bytes back.
- `.github/workflows/publish-connector-zip.yml` moves the `v<version>` tag to the newest `main` commit on every push, so released zips of one version are also indistinguishable by version alone.

Stakeholders: the maintainer uploading preview packages, and any operator asked to confirm which build a tenant runs.

## Goals / Non-Goals

**Goals:**

- A packaged connector states the exact tree it was built from, in a surface ISC already renders.
- The stamp moves on every package without touching `package.json` `version`.
- The committed `connector-spec.json` never keeps a stamp.
- The maintainer can print the stamp of the current checkout without packaging, for comparison.
- Packaging from an unclean tree is visibly marked.

**Non-Goals:**

- The connector deciding or reporting "behind" or "current" against a published reference.
- Outbound network calls from ISC, published reference files, or update checks.
- Changing semver, tags, release notes, or the release workflow.
- A runtime log line carrying the stamp (deferred; see Open Questions).
- Any change to connector operation behaviour.

## Decisions

### D1: Stamp the spec between build and package

- **Choice**: `npm run pack-zip` runs a wrapper script that reads `connector-spec.json`, writes a stamped copy, runs `spcx package`, and restores the original bytes in a `finally` block.
- **Reason**: the zip takes the spec straight from the repo root, and the committed file must stay clean for lint, slim rewrite, and `git status`. A wrapper is the only seam that sees the file both before and after the CLI.
- **Considered alternatives**: rewriting the finished zip (needs a zip dependency, diverges from `spcx` output, breaks on CLI changes); a generated TypeScript module read at runtime (the help text is static JSON, so the bundle cannot influence it); an env var read at package time (nothing persists it into the zip).

### D2: Format is `Build: <sha7>[-dirty] <YYYY-MM-DD> <branch>`

- **Choice**: append one sentence after the installed connector version sentence, e.g. `Build: <strong>def5678</strong> 2026-11-11 2.2.0/preview`. The sha takes `-dirty` when source changes were uncommitted at pack time. The CLI prints the same line as plain text (`Build: def5678 2026-11-11 2.2.0/preview`) so a tenant can be compared by eye.
- **Reason**: space-separated fields stay greppable and survive HTML rendering without separator ambiguity; commit date rather than wall-clock date means a rebase does not make an older tree look newer.
- **Considered alternatives**: semver build metadata (`2.2.0+def5678`) — legal SemVer and equal-precedence to `2.2.0`, but operators read the help line, not the version token; a moving pre-release version (`2.2.0-preview.47`) — requires a manual bump per upload and reads as a release.

### D3: Resolve git facts in one pure formatter

- **Choice**: `formatBuildStamp({ sha, date, branch, dirty })` returns the canonical line; `resolveBuildStamp({ cwd, env, exec })` gathers the facts. Branch comes from `GITHUB_REF_NAME` then `GITHUB_HEAD_REF`, else `git rev-parse --abbrev-ref HEAD`; a detached checkout without CI env resolves to `detached`. Missing git, no commits, or a failed command yields `Build: unknown` rather than failing the package.
- **Reason**: packaging must never be blocked by build identity, and a pure formatter is directly testable without a repository.
- **Considered alternatives**: shelling out inline in the pack wrapper (untestable, duplicates git parsing); failing the pack when git is unavailable (a package without identity is still more useful than no package).

### D4: Dirty detection ignores `connector-spec.json`

- **Choice**: resolve dirty from `git status --porcelain --untracked-files=normal`, dropping entries whose path is `connector-spec.json`. Ignored paths are excluded automatically by git.
- **Reason**: `prebuild` rewrites the spec on every build, and the wrapper stamps it, so counting it would mark every package dirty. Non-ignored untracked files still count, because a new source file that the bundle imports changes the shipped bytes.
- **Considered alternatives**: `git diff-index --quiet HEAD` (misses untracked files); `--untracked-files=no` (misses a new imported source file).

### D5: Stamping is idempotent and restores exact bytes

- **Choice**: injection strips any existing `Build: …` sentence from the Developer Settings help before inserting the new one, and the wrapper restores the exact bytes read at start. A failed or aborted `spcx package` run leaves the tree unchanged.
- **Reason**: a hard kill can leave a stamped file behind; a later pack must not append a second line. Byte-exact restore means `git status` stays empty and no formatting drift enters the repository.
- **Considered alternatives**: aborting when the spec is already stamped (turns a recoverable leftover into a manual repair); formatting-preserving string surgery on the raw JSON (the JSON round-trip is already byte-identical, so it buys nothing).

### D6: The committed spec keeps the bare version

- **Choice**: the canonical `SECTION_HELP` template in `scripts/connector-spec-help-lib.cjs` is unchanged. Only the packaged copy carries the stamp.
- **Reason**: `npm run lint`, `docs:prepare`, and the slim rewrite all read the working-tree file. A committed stamp would drift by definition and would fail a "contains current version" check on the wrong grounds.
- **Considered alternatives**: committing the stamp of the last pack (guaranteed drift, noisy diffs); adding the stamp to the template with a placeholder (rewrite would write a literal placeholder into the repo).

### D7: Two entry points, one module

- **Choice**: `scripts/connector-build-stamp.cjs` holds the pure helpers plus a CLI (`--print`, `--write`, `--restore`); `scripts/pack-connector-zip.cjs` is the wrapper that calls them around `spcx package`. `package.json` gains `build:stamp` and repoints `pack-zip`.
- **Reason**: keeps the testable logic out of the wrapper and leaves `pack-zip` a two-line delegation whose failure handling is obvious.
- **Considered alternatives**: one file doing both (mixes CLI parsing with subprocess handling); a `prepack-zip`-only hook (runs before the build, so the bundle and the stamp could disagree).

### D8: Documentation surface

- **Choice**: one new use guide, `docs/use-guides/operation/verify-deployed-connector-build.md`, with the read-compare-decide workflow and the limits of `-dirty`; a nav entry after **Reset Fusion state**; a glossary term; and cross-links from the reset guide and the troubleshooting **Environment** row. The reset guide keeps its pointer to Developer Settings section help and links to the new guide rather than repeating the workflow.
- **Reason**: project convention is one topic per use guide with cross-links, and the guide structure linter enforces it. The reset guide is about resetting state, not about verifying deployments.
- **Considered alternatives**: extending the reset guide (wrong topic, and it is already long); a section in the troubleshooting guide (router page, no embedded mini-guides).

## Risks / Trade-offs

[Risk] A hard kill between stamp and restore leaves a stamped `connector-spec.json` in the tree. -> Mitigation: `finally` restore covers normal failure and Ctrl-C; injection is idempotent so the next pack corrects the line; the guide documents `git checkout -- connector-spec.json`. A lint failure on "version drift" is the tripwire.

[Risk] A maintainer packs from a tree whose source differs from HEAD and ships it as current. -> Mitigation: `-dirty` in the stamp, and the guide tells operators a dirty stamp cannot be matched to a commit.

[Risk] The stamped sentence pushes the Developer Settings help past its limits if future copy grows. -> Mitigation: a test asserts the stamped spec still passes `collectViolations` with the current limits.

[Risk] Two preview packages from the same commit but different machines. -> Mitigation: same commit yields the same stamp by design; a differing stamp means differing bits or a differing branch label, which is the signal operators want.

[Trade-off] The stamp is only visible after re-uploading a package; tenants on older packages show the version alone. -> Reason for acceptance: no migration is possible for an already-deployed package, and the absence of a stamp is itself the "older than this feature" signal.

[Trade-off] Release zips on `main` also carry a stamp, so `v2.2.0` stays a rolling label. -> Reason for acceptance: this matches the existing force-moved tag; no release semantics change.

## Migration Plan

N/A — this change does not involve deployment changes. The next package uploaded to a tenant carries the stamp; packages already uploaded are unaffected and keep showing only the installed connector version.

Acceptance checks before handoff: packing twice from one clean commit produces the identical stamp; packing from a tree with an uncommitted source edit produces `-dirty`; `git status --porcelain` is empty after a successful and after a failed pack.

## Open Questions

- A runtime log line carrying the stamp at test connection: deferred. It is only visible when external logging is enabled, so it does not replace the help line, and adding it would couple the bundle build to the stamp. Revisit only if operators ask to read the build from a log instead of the UI.
