## Retrospective: align-identity-naming-ubiquitous-language

### What went well

- Delta spec sync was clean: 4 ADDED requirements, 1 MODIFIED requirement, 1 retired-term row — all merged into `openspec/specs/ubiquitous-language/spec.md` without conflicts.
- Lint and markdown checks remained green throughout; no style regressions.
- Glossary (`docs/concepts/glossary.md`) was already aligned with the canonical-terms table, so the rename of `identity display name` → `identity name` did not require a second pass.

### What was hard

- Delta spec used a delta-style `## ADDED Requirements` format while the main spec is a full spec — required careful diffing to avoid duplicating requirements already present in the source.
- The `Retired terms` requirement needed both a body-text update and a new scenario, plus a row in the retired-terms table — easy to miss one of the three touch points.

### What to do differently next time

- When retiring a term, update all three locations in one pass: requirement body, scenario list, and retired-terms table.
- Run `openspec status --change <name> --json` after writing the delta to confirm the artifact graph status before attempting archive.
