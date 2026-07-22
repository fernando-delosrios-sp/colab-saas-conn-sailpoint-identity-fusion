## 1. Update the ubiquitous-language spec

- [x] 1.1 Add the "Identity reference and Fusion account naming" section to `openspec/specs/ubiquitous-language/spec.md` with the definitions for `identityAlias`, `identityName`, and `Fusion account name`.
- [x] 1.2 Add usage scenarios for the Fusion display attribute override, user-facing identity references, identity lookup, and the Velocity identity context.
- [x] 1.3 Update the "Retired terms are not reintroduced" requirement to include `identity display name`.
- [x] 1.4 Run `npm run lint:markdown` and fix any issues.

## 2. Update the user-facing glossary

- [x] 2.1 Add the "Identity reference and Fusion account naming" section to `docs/concepts/glossary.md` with the same definitions.
- [x] 2.2 Run `npm run lint:markdown` and fix any issues.

## 3. Verify alignment

- [x] 3.1 Confirm that `docs/concepts/glossary.md` and `openspec/specs/ubiquitous-language/spec.md` use the same term definitions and do not contradict each other.
- [x] 3.2 Confirm that the retired term `identity display name` is replaced by `identity name` in both files.
- [x] 3.3 Run `npm run lint` to ensure no markdown or project-level lint errors are introduced.

## 4. Archive and close the change

- [x] 4.1 Run `/opsx:verify` to confirm the implementation matches the spec.
- [x] 4.2 Run `/opsx:archive` to close the change.
