## 1. Static Analysis Setup

- [x] 1.1 Install `knip` (or `eslint-plugin-unused-imports`) and add it to `package.json` devDependencies.
- [x] 1.2 Configure `knip` to run in the `lint` script in `package.json` to enforce build-time errors on unused exports.
- [x] 1.3 Add a `knip.json` or `knip` configuration block in `package.json` to ignore any required entry points or dynamically loaded files.

## 2. ESLint Guardrails Update

- [x] 2.1 Update `eslint.config.mjs` to set `'no-explicit-any'` to `'warn'`.
- [x] 2.2 Update `eslint.config.mjs` to set `'no-case-declarations'` to `'error'`.
- [x] 2.3 Run ESLint with the new configuration and fix any easy/low-hanging `no-case-declarations` errors.

## 3. The Great Purge

- [x] 3.1 Run `knip` to identify all unused exports project-wide.
- [x] 3.2 Remove `STATS_LOGGING_INTERVAL_MS` and other unused exports in `src/services/clientService/constants.ts` and `src/services/clientService/index.ts`.
- [x] 3.3 Remove the unused `getShortTimestamp` function in `log-server.js`.
- [x] 3.4 Remove the unused `isRecordMatchingEnabledForSource` private method in `src/services/fusionService/fusionService.ts`.
- [x] 3.5 Remove the unused `_TOKEN_PATTERNS` constant in `src/services/attributeService/contextHelpers/dateUtils.ts`.
- [x] 3.6 Remove all other unused exports and files found by the static analysis tool.
