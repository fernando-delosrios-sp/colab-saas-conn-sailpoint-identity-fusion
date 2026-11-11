## Scope

In: the connector package carries an identifier of the exact tree it was built from, visible in ISC, so an operator can tell whether a tenant runs the current preview build or an older one.

Out: any connector behaviour that decides "behind" or "current" on its own; published reference files; automatic update checks; semver changes; git tags or release notes.

## Language

**Connector build stamp** (`promote`): The identity of the exact bytes in a connector package — short commit SHA, commit date, and branch, with a dirty marker when the working tree had uncommitted changes at pack time. It moves with every package and is independent of the release label.
_Avoid_: build number, CI build id, version.

**Installed connector version** (`conflicts-with-canonical`): Canonical glossary defines it as the `package.json` `version` semver and excludes git SHAs. That definition stays correct for what the term means, but the canonical text also implies it answers "which package is deployed". This change keeps the semver meaning and adds that it is a release label, not build identity — compare builds with **connector build stamp**. The specs phase carries a MODIFIED requirement for this.

**Preview branch** (`draft`): A branch used to build and upload packages against a released version without bumping it, for example `2.2.0/preview`. It is the branch component of a **connector build stamp**, not a release.
_Avoid_: pre-release version, hotfix version.

## Decisions

1. **Two questions, two answers.** "Which bits are installed?" is answered by the package itself. "Is this tenant current?" needs a reference the operator trusts. Context from the exploration: `package.json` `version` is `2.2.0`, `connector-spec.json` carries `"version": "2.2.0"`, and every preview upload shows the same Developer Settings line, so a tenant cannot be told apart from its neighbour by version.
2. **The package shows the build stamp; the operator compares it.** Chosen over having the source report behind/current, which needs a published expected build plus an outbound fetch from ISC and a policy for fetch failure. The user chose the stamp-only option: no published reference, no network call, nothing extra to keep in sync.
3. **Stamp lives in the Developer Settings section help.** It is the only version surface the ISC UI renders, it is visible before any operation runs, and documentation already points operators there. `sectionTitle` stays `Developer Settings`.
4. **Stamp format**: `Build <sha7>[-dirty] <YYYY-MM-DD> <branch>` appended after the installed connector version sentence. Commit date, not wall-clock date, so a rebase does not make an older tree look newer.
5. **Injection point is packaging, not the committed tree.** Verified: `npm run pack-zip` is `spcx package`, npm runs `prepack-zip` (`npm ci && npm run build`) first, and the resulting zip contains exactly `dist/index.js` plus the repo-root `connector-spec.json`. So a wrapper can stamp `connector-spec.json`, run `spcx package`, and restore the file. The committed spec keeps the bare semver, which is what `check-connector-spec-help.cjs` and the slim rewrite already assert.
6. **`package.json` `version` is not touched.** A moving `2.2.0-preview.47` would have to be bumped by hand on every upload and would look like a release. Semver build metadata was rejected because the help line is where operators look, and it is already documented that way.
7. **Dirty detection excludes `connector-spec.json`.** `prebuild` already rewrites that file (`sync-connector-spec-initial-values.cjs`), so counting it would mark every package dirty.

## Open questions

- None blocking. Deferred by choice: a runtime log line carrying the same stamp at test connection. It is only visible when external logging is enabled, so it does not replace the help line; the change does not add it.

## Scenarios discussed

- Preview worktree packed twice from the same commit: identical stamps, so the tenant is current.
- Tenant uploaded before the latest commit: stamp differs, so it is behind that commit.
- Branch rewound and re-uploaded: stamp is ahead of the tenant, which reads as "different", not "current".
- Packaging from a tree with uncommitted source edits: `-dirty` marks it, because two packages from that commit can differ.
- Packaging fails midway: `connector-spec.json` must be restored, or the working tree keeps a stamp that no commit contains.
- CI release build: `main` packages get a stamp too, so released zips are identifiable by commit.
