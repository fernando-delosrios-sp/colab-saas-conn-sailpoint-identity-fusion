# Exploration notes: version-update-procedure

Captured during /opsx-explore on 2026-06-23. Records the
alternatives considered and the choices made, so future agents
(including future-you) can recall *why* this change looks the way
it does.

## Problem framing

- "For every version update, changelog and docs must be in sync."
- Two distinct surfaces: README.md ## Changelog and docs/**.
- Today, ci-check-readme-changelog.cjs guards the changelog only
  in the coarse "product files changed" sense. It does not detect
  a version bump, does not require a new ### X.Y.Z heading, and
  does not require docs/** to change.
- The GitHub Release body is auto-generated from PR titles and
  can disagree with the curated ## Changelog.

## Decisions taken

1. Version bump trigger: **manual edit of package.json**.
   release-please / changesets were considered and rejected as
   heavier than the project needs.
2. Changelog source: **hand-curated**, matching the existing
   dated-bullet style. No auto-generation.
3. Docs update scope: **hard requirement that at least one
   docs/** file change in the version-bumping PR**.
4. Enforcement: **the coding agent, not CI**. The
   new-version-full-review.yml pipeline stays untouched.
5. Hard-requirement mechanism: **touch the most-affected guide
   page from a src->docs map**. No dedicated release-notes page
   (rejected to avoid feature creep into this change).
6. Agent form: **subagent at .opencode/agents/release-prep.md,
   driven by a thin command at .opencode/commands/release-prep.md**.
   OpenSpec specs are intended to steer the agent; if that turns
   out not to be how opencode naturally behaves, fall back to
   inlining the procedure in the subagent prompt.

## Alternatives explicitly rejected

- "release-please / changesets manages everything" -- too much
  process change for a single-tenant connector.
- "Versioned docs site with mike" -- the docs are not versioned
  today; introducing that is its own project.
- "Soft warning + required label" -- friendly but easy to ignore.
- "Post-merge bot opens a follow-up PR" -- adds a moving part
  for marginal value over the agent approach.
- "Dedicated docs/release-notes.md" -- rejected as feature creep;
  the most-affected-guide mechanism is enough.

## Open questions for design.md

- The src->docs scope map needs a sweep of src/ before being
  authoritative. Inline in design.md vs. companion file.
- Whether the agent should re-read connector-spec.json at
  release time to detect renamed/removed fields. (Likely yes.)
- Whether the agent should also update docs/index.md (the
  MkDocs home) or rely on the existing scripts/sync-docs-home.cjs.
- Whether the proposal must pass the `grill-me` skill per
  openspec/config.yaml before being written. Decision deferred.

## Files this change will touch (for the implementer)

- openspec/changes/version-update-procedure/{proposal,design,tasks}.md
- openspec/changes/version-update-procedure/specs/version-update-procedure/spec.md
- openspec/specs/version-update-procedure/spec.md (post-archive)
- .opencode/agents/release-prep.md
- .opencode/commands/release-prep.md
- docs/guides/*.md (at release time, by the agent)
- No CI, package.json, connector-spec.json, or mkdocs.yml changes.
