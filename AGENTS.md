# AI Agent Rules

## Running Tests
NEVER run `npm test 2>&1 | tail -40` or pipe `npm test` / `jest` output directly to `tail`. 
Piping to `tail` buffers the entire output until EOF. This means AI agents will not receive any incremental log output, and if the tests hang (e.g., due to open handles), the agent will sit indefinitely without receiving any error or timeout clues. 

**What to do instead:**
- Run the test directly: `npm test` (if output is short enough).
- If the output is extremely long, redirect output to a file and read it later: `npm test > test-output.log 2>&1`, then view `test-output.log`.
- Run specific test files instead of the entire suite to keep output short and relevant.

<!-- Source: ferspec/templates/adopters/AGENTS.md.fragment.md -->
<!-- Drop this section into your project's AGENTS.md so agents route future work using this schema correctly. -->

## Agent communication

- Use **plain English** — avoid jargon unless the user already uses it.
- Keep explanations **succinct**. State the conclusion first; add detail only when it helps a decision.
- When a topic could go deep, **offer to develop it further** — do not unprompted long dissertations or essay-length replies.
- When you need input, **ask one question at a time** and wait for the answer before the next.

<!-- User gates: structured-choices Install owns AGENTS.md / CLAUDE.md User gates (### under Agent skills, or ## standalone). Run install after setup-matt-pocock-skills. -->

## Workflow routing (read on session start)

This repo uses the **ferspec** OpenSpec schema. Artifact instructions inject at each `/opsx:*` step; skills carry execution detail.

### Entry routing

| Trigger you observe | What to do |
|---|---|
| User starts a narrative design discussion | Run verbal grilling via **grill-with-docs**, but **do NOT** write repo-root CONTEXT.md. When converged per the 5 criteria below, promote to `/opsx:propose` |
| User invokes `/opsx:new` / `/opsx:ff` / `/opsx:propose` directly | Follow the ferspec schema flow |
| User explicitly says bug fix / typo / config tweak / doc update | Direct PR — **do NOT** open a change |
| User is mid-change | Advance with `/opsx:continue`, `/opsx:apply`, or `/opsx:archive` (archive is manual, never part of apply) |

### When NOT to use opsx (direct PR)

| Scenario | Direct PR? |
|---|---|
| New feature / new capability / architectural change / breaking change | ❌ Use opsx |
| Bug fix (no contract change) / test backfill / linter tweak / non-breaking upgrade / typo / docs / config value tweak | ✅ Direct PR |

Principle: **process ceremony scales with risk**. External contracts / schema / cross-system integration / compliance → opsx. Otherwise → direct PR.

### Verbal discovery → opsx promotion criteria

All 5 must hold before promoting (any missing → keep grilling, **never** write repo-root CONTEXT.md):

1. **Scope locked** — one sentence describes what's in / out
2. **Major design forks resolved** — alternatives weighed; remaining TBDs have an owner and impact-scope statement
3. **Cross-system dependencies mapped** — ready / mockable / genuinely unknown — pick one per dep
4. **Acceptance criteria stateable** — concrete pass conditions (e.g., `./mvnw clean verify` passes + N deliverables)
5. **Conversation converging** — recent turns are confirmations, not new alternatives

When all 5 hold → proactively suggest "ready to `/opsx:propose`?" — wait for user ack. Never auto-trigger.

### Front-door anti-patterns (don't do)

- Writing durable vocabulary to repo-root CONTEXT.md instead of discovery.md / ubiquitous-language spec
- Promoting to opsx with unresolved blocking TBDs
- Opening a change for bug fix / typo
- Running archive or spec sync inside apply — user runs `/opsx:archive` after merge or when ready
- Reporting archive complete without committing synced specs and the moved change folder — archive requires commit + post-commit gate (see ferspec README § Archive)

## Build & Dev Commands

**Prerequisites:** Node.js 24 (see `.nvmrc` — run `nvm use` or `fnm use`).

| Command | Purpose |
|---------|---------|
| `npm run build` | Clean + sync spec + bundle with ncc to `dist/` |
| `npm test` | Run the global Vitest suite (excludes `src/operations/__tests__/scenario/`) |
| `npm run test:scenario` | Run the scenario recording Vitest suite (`src/operations/__tests__/scenario/**/*.test.ts`) |
| `npm run test:watch` | Vitest in watch mode (global suite) |
| `npm run test:coverage` | Vitest with v8 coverage (global suite) |
| `npm run lint` | ESLint + connector-spec help check + knip (dead code check) |
| `npm run lint:markdown` | markdownlint on README + docs |
| `npm run lint:docs-guides` | Use-guide IA check (duplicate headings, owned sections) |
| `npm run dev` | Run connector locally with spcx + source maps |
| `npm run docs:serve` | Build and serve MkDocs site locally |
| `npm run prettier` | Format all files with Prettier |

**Before committing:** run `npm run lint` (catches type issues, unused code, and style violations). For documentation edits under `docs/use-guides/`, also run `npm run lint:docs-guides`.

## Documentation

MkDocs site under `docs/`. Use guides follow **one topic per page**; routers link out instead of embedding other topics.

| Role | Location | Rule |
| --- | --- | --- |
| **Router** | `getting-started/index.md`, `use-guides/configuration/index.md`, `use-guides/operation/index.md`, `validation-and-troubleshooting/troubleshooting.md` | Tables and links; minimal how-to prose |
| **Topic guide** | `docs/use-guides/**` (except `index.md`) | One configuration or operation concern per file |
| **Reference** | `docs/configuration/`, `docs/reference/`, `docs/operations/` | Field keys, APIs, runtime behavior (e.g. `reference/match-flow.md`) |
| **Cookbook** | e.g. `match-tuning-cookbooks.md` | Self-contained scenarios; may repeat settings tables |

**Do:** cross-link related guides. **Don't:** copy workflow sections that already have a canonical owner (dry-run → `operation/analyze-with-dry-run.md`, reviewers → `configuration/managing-reviewers.md`, capture/replay → `operation/capture-scenarios-for-replay.md`).

Verify: `npm run lint:docs-guides` · `npm run lint:markdown` · `npm run docs:prepare`

```
src/
├── index.ts              # Connector entry point — registers all operations
├── data/                  # Configuration, schema, action enums, status types
│   └── config/            # Settings definitions (connection, matching, sources, etc.)
├── model/                 # Domain models (FusionAccount, FusionConfig, etc.)
├── operations/            # ISC connector operations (accountList, accountRead, etc.)
│   └── helpers/           # Pipeline, dry-run, rebuild helpers
├── services/              # Service layer (attribute, client, fusion, scoring, etc.)
│   ├── attributeService/  # Map + Define engine (Velocity, normalization, UUID)
│   ├── clientService/     # ISC API client (SDK adapter, queue, retry)
│   ├── formService/       # Review form builder + processor
│   ├── fusionService/     # Core aggregation, correlation, identity processing
│   ├── scoringService/    # Match scoring (exact, name, trigram, string comparison)
│   └── sourceService/     # Managed source account aggregation
└── utils/                 # Shared utilities (safeRead, operationHandler, assert, etc.)
```

**Key patterns:**
- Tests live in `__tests__/` directories alongside the code they test
- Services follow `ServiceName/index.ts` barrel exports
- Config settings each have their own file under `data/config/settings/`

## Code Conventions

### TypeScript
- **Strict mode** enabled (`tsconfig.json`: `strict: true`)
- **ES2022 target**, CommonJS modules, source maps on
- ESLint with `typescript-eslint` recommended rules + `jsdoc` plugin
- `no-explicit-any`: **off** — `any` is allowed where needed
- `no-case-declarations`: **error** — wrap in `{}` blocks
- `_` prefix is reserved for **unused** variables, parameters, and functions (matches ESLint `argsIgnorePattern` / `varsIgnorePattern: '^_'`)
- Use TypeScript `private` / `protected` for non-public members — no `_` prefix
- Accessor backing fields use the `Value` suffix (e.g. `private nameValue` backing `get name()`)
- Import style: ESM `import`/`export` for `.ts` files; `require()` only in `.cjs`/`.js` scripts

### Formatting (Prettier)
- 120 char width, 4-space tabs, single quotes, no semicolons, trailing commas (ES5)

### Naming & Structure
- Files: `camelCase.ts` for modules (`attributeService.ts`), `PascalCase.ts` for classes/models
- Barrel exports: each service exports via `index.ts`
- JSDoc on exported functions and classes (not enforced by lint, but used throughout)

### Error Handling
- Use `ConnectorError` from `@sailpoint/connector-sdk` for known operation errors
- Wrap in `createOperationHandler` — catches unknown errors and re-throws as `ConnectorError`

### Testing
- **Vitest** with `globals: true` (no imports needed for `describe`/`it`/`expect`)
- Test files: `*.test.ts` in `__tests__/` directories
- 180s timeout (long-running integration tests)

## Ubiquitous Language

AI agents MUST use the canonical terms defined in `openspec/specs/ubiquitous-language/spec.md` when generating code, documentation, or configuration. Before introducing a new domain term, add it to the spec first.
