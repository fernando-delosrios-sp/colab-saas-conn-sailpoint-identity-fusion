## Context
The codebase has relaxed ESLint rules which have led to a build-up of dead code (unused variables, unused exports) and unsafe types (`any`). Current ESLint configuration specifically turns off `no-explicit-any` and `no-case-declarations`, and suppresses `@typescript-eslint/no-unused-vars` to a warning. Additionally, specific files and directories are completely ignored by the linter.

## Goals / Non-Goals

**Goals:**
- Eliminate known and unknown dead code.
- Remove the usage of `any` in favor of stricter TypeScript typings.
- Enable `no-case-declarations` and fix existing violations.
- Stop ignoring files (`log-server.js`, `scripts/`) unnecessarily.

**Non-Goals:**
- Refactoring the core logic of the application.
- Fixing lint errors that are not related to dead code, typings, or case declarations.

## Decisions

**Decision 1: Enforce `@typescript-eslint/no-unused-vars` as an error**
- *Rationale*: We must stop the bleeding by failing the build when dead code is introduced. Warnings are too easily ignored.
- *Alternatives considered*: Leave as warning and manually clean up periodically. Rejected because it does not solve the root cause.

**Decision 2: Enforce `no-explicit-any` as an error**
- *Rationale*: `any` disables TypeScript's safety net, leading to runtime bugs and difficulty reasoning about the code.
- *Alternatives considered*: Only fix specific files. Rejected because it leaves blind spots.

**Decision 3: Enforce `no-case-declarations` as an error**
- *Rationale*: Variables declared inside switch cases leak into the entire switch block unless the case is wrapped in block scoping (`{ }`). This is a common source of unexpected behavior.
- *Alternatives considered*: Leave it off. Rejected because the fix is trivial (adding braces).

## Risks / Trade-offs
- **Risk**: Stricter typing may require complex generic definitions or extensive changes to API boundaries.
  - *Mitigation*: We will carefully review the changes and fall back to `unknown` and type narrowing instead of `any` if necessary.
- **Risk**: Deleting "unused" exports that are actually consumed by external systems or dynamic imports.
  - *Mitigation*: We will perform a final `grep` across the entire workspace to ensure no dynamic references exist.
