# AI Agent Rules

## Communication

- Use plain English. Lead with the conclusion, then add detail only if it helps.
- Ask one question at a time, and wait for the answer before asking the next.

## Running Tests

- Never pipe test output into `tail` or `head`. It hides progress and hides hangs.
- For long output, redirect to a file and read it: `npm test > test-output.log 2>&1`.
- Prefer running specific test files over the full suite.

## Commands

Requires Node.js 24 (see `.nvmrc`).

| Command | Purpose |
|---------|---------|
| `npm run build` | Build to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:scenario` | Scenario recording tests |
| `npm run lint` | ESLint, connector spec check, dead code check |
| `npm run lint:markdown` | Markdown lint for README and docs |
| `npm run lint:docs-guides` | Use-guide structure check |
| `npm run prettier` | Format all files |

Run `npm run lint` before committing. For changes under `docs/use-guides/`, also run `npm run lint:docs-guides`.

## Code Conventions

- TypeScript strict mode, ES2022, CommonJS.
- Use ESM `import`/`export` in `.ts` files. Use `require()` only in `.cjs`/`.js` scripts.
- Prettier: 120 width, 4-space indent, single quotes, no semicolons, ES5 trailing commas.
- Prefix `_` only on unused variables, parameters, and functions.
- Use TypeScript `private`/`protected` for non-public members. No `_` prefix.
- Accessor backing fields end in `Value` (e.g. `nameValue` backs `get name()`).
- Wrap `case` bodies that declare variables in `{}`.
- Throw `ConnectorError` from `@sailpoint/connector-sdk` for known errors. Wrap operations in `createOperationHandler`.
- Files: `camelCase.ts` for modules, `PascalCase.ts` for classes and models.
- Each service exports through its `index.ts`.
- Tests: `*.test.ts` in `__tests__/` folders. Vitest globals are enabled.

## Project Layout

- `src/index.ts`: connector entry point
- `src/data/`: config, schema, enums, status types
- `src/model/`: domain models
- `src/operations/`: ISC operations
- `src/services/`: business logic
- `src/utils/`: shared helpers

## Package Lock Registry URLs

Running `npm install` through Artifactory rewrites `resolved` URLs in `package-lock.json`. Do not commit those.

Before committing `package-lock.json`:

1. Search the file for `jfrog.io` and `artifactory`.
2. Rewrite each match to the public registry, keeping the package path and tarball name:

```
https://sailpoint.jfrog.io/artifactory/api/npm/sp-npm-dev/concurrently/-/concurrently-9.2.5.tgz
→ https://registry.npmjs.org/concurrently/-/concurrently-9.2.5.tgz
```

Leave `integrity` unchanged.

## Workflow

- New features, architectural changes, and breaking changes: use an OpenSpec change.
- Bug fixes, typos, docs, and config tweaks: open a direct PR.

## Documentation

- MkDocs site lives in `docs/`. Keep one topic per use guide and cross-link related guides instead of copying them.
- Verify docs changes with `npm run lint:markdown` and `npm run docs:prepare`.

## Ubiquitous Language

Use the canonical terms in `openspec/specs/ubiquitous-language/spec.md`. Add any new domain term to that spec before using it in code or docs.
