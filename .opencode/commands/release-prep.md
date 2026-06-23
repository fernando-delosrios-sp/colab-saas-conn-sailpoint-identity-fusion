---
description: Prepare a release after bumping package.json
---

Delegate to the `release-prep` subagent. The maintainer runs this
command after bumping the `version` field in `package.json`.

The subagent:

1. reads `openspec/specs/version-update-procedure/spec.md` as the
   policy;
2. detects the version bump (current `version` vs the previous
   version tag);
3. drafts a `### X.Y.Z` block at the top of `## Changelog` in
   `README.md` from the merged PR titles since the previous tag;
4. edits the most-affected guide in `docs/guides/`, picked from the
   `src -> docs` map embedded in the subagent prompt;
5. reports the diff. The developer reviews and commits manually.

See `.opencode/agents/release-prep.md` for the full algorithm and
the `src -> docs` map.

**Takes no arguments.** The maintainer just runs `/opsx:release-prep`
in opencode after the version bump and before opening the release PR.
