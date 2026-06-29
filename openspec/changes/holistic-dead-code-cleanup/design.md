## Context

The codebase contains unreferenced exports, private methods, and constants, leading to maintenance burden. The ESLint configuration has permissive rules for `any` and `no-case-declarations`, and lacks a build-time guard against unused exports. A tool like `ts-prune` or `knip` is needed to perform the static analysis and serve as a permanent check in the CI pipeline.

## Goals / Non-Goals

**Goals:**
- Eradicate existing dead code.
- Prevent future dead code via CI checks.
- Enforce stricter TypeScript/ESLint rules for typing and case declarations without entirely blocking progressive migrations.

**Non-Goals:**
- Completely rewriting all `any` usages immediately. We will only `warn` on `any` for now and fix what we can.
- Introducing a major structural architecture change beyond static analysis tooling.

## Decisions

- **Static Analysis Tool**: We will use `knip`. It's the industry standard for finding unused files, dependencies, and exports in JS/TS projects. It's fast and easy to integrate into the CI.
- **ESLint `no-explicit-any`**: Set to `warn` instead of `error`. An error might block other development until all `any` types are fixed. Warning stops new additions from being silently accepted while we fix existing ones.
- **ESLint `no-case-declarations`**: Set to `error`. This is usually a symptom of a bug and is easy to fix immediately.

## Risks / Trade-offs

- **Risk**: `knip` might report false positives for files dynamically imported or exports used by external systems that it doesn't recognize.
  **Mitigation**: We will configure `knip.json` (or equivalent package.json config) to explicitly ignore entry points or external-facing API types if needed.
- **Risk**: Deleting "unused" code that was actually a work in progress by another developer.
  **Mitigation**: Standard Git review process should catch this; PRs should be communicated to the team.
