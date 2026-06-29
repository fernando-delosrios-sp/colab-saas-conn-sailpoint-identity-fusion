## Why

The codebase has accumulated dead code (unused constants, private methods, helper functions) due to permissive linting configurations (`no-explicit-any`, `no-case-declarations` off). This creates a maintenance burden, increases confusion, and decreases developer confidence. A holistic, systematic approach is needed to purge existing dead code and put permanent guardrails in place to prevent future code rot.

## What Changes

- Run a systematic static analysis tool (e.g., `ts-prune` or `knip`) across the entire repository to identify all unused exports, types, and files.
- Purge all identified dead code, including known unused exports in `CLIENT_SERVICE/constants.ts`, `getShortTimestamp` in `log-server.js`, `isRecordMatchingEnabledForSource` in `fusionService.ts`, and `_TOKEN_PATTERNS` in `dateUtils.ts`.
- Update `eslint.config.mjs` to systematically prevent dead code: add a plugin or integrate a dead-code scanner into the CI pipeline to `error` on unused exports.
- Update `eslint.config.mjs` to set `no-case-declarations` to `error`.
- Update `eslint.config.mjs` to set `no-explicit-any` to `warn` to stop new instances from being added while allowing for progressive fixes.

## Capabilities

### New Capabilities
- `code-quality-guardrails`: Establishes the static analysis rules, linter constraints, and CI build failure conditions for dead code and permissive type checks.

### Modified Capabilities
None.

## Impact

- **Codebase Health**: Deletes obsolete code across the repository.
- **CI/CD**: The lint step will be stricter, failing on unused exports and bad case declarations, and warning on explicit `any`.
- **Developer Workflow**: Developers will have to clean up their unused exports before committing/passing CI.
