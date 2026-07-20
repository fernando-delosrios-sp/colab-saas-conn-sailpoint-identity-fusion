# lean-ctx — Context Engineering Layer
<!-- lean-ctx-rules-v12 -->

## Tool Mapping (MANDATORY — use instead of native equivalents)
| Instead of | Use | Example |
|------------|-----|---------|
| Read/cat/head/tail | `ctx_read(path, mode)` | `ctx_read("src/main.rs")` (omit mode = auto) |
| Grep/rg/find | `ctx_search(pattern, path)` | `ctx_search("fn handle", "src/")` |
| Shell/bash | `ctx_shell(command)` | `ctx_shell("cargo test")` |
| Edit (when Read unavailable) | `ctx_edit(path, old, new)` | `ctx_edit("f.rs", "old", "new")` |

## URL / File Tool Selection
- **Local files MUST be read with `ctx_read(path, mode)`**, never with Fetch URL or `webfetch`.
- Fetch URL / `webfetch` are ONLY for `http://` and `https://` URLs.
- `file://` paths are NOT valid input for Fetch URL. Convert them to absolute filesystem paths and use `ctx_read`.

## ctx_read Mode Selection (omit mode to auto-select — recommended)
| Goal | Mode | When |
|------|------|------|
| Exploring / unsure | `auto` (default) | Omit mode; system picks optimal |
| Edit this file | `full` | Right before an edit |
| Understand API | `signatures` | Context-only, won't edit |
| Large file overview | `map` | >500 lines, won't edit |
| Re-read after edit | `diff` | Post-edit verification |
| Specific region | `lines:N-M` | Know exact location |

## Workflow (follow this order)
1. **Orient:** `ctx_overview(task)` or `ctx_compose(task, path)` for unfamiliar tasks
2. **Locate:** `ctx_search(pattern, path)` for exact text; `ctx_semantic_search(query)` for concepts
3. **Read:** `ctx_read(path, mode)` with appropriate mode from table above
4. **Edit:** `ctx_edit(path, old_string, new_string)` or native Edit if available
5. **Verify:** `ctx_read(path, "diff")` + `ctx_shell("test command")`
6. **Record:** `ctx_knowledge(action="remember", content="...")` for non-obvious findings

## Session
- **Start:** `ctx_session(action="status")` + `ctx_knowledge(action="wakeup")`
- **End:** `ctx_session(action="decision", content="what was done + next steps")`
- **On [CHECKPOINT]:** `ctx_session(action="task", value="current status")`

NEVER use native Read/Grep/Shell when ctx_* equivalents are available.
<!-- /lean-ctx -->

<!-- lean-ctx-rules -->
<!-- version: 8 -->

lean-ctx shadow mode: native file/search/shell calls auto-route to ctx_* — no tool-mapping needed.
Exclusive tools (no native trigger): ctx_compose (understand code, call first), ctx_search(action=symbol) (exact symbol), ctx_search(action=semantic) (by meaning), ctx_callgraph (callers), ctx_knowledge / ctx_session (memory).
<!-- lean-ctx-compression -->
OUTPUT STYLE: concise
- Bullet points over paragraphs
- Skip filler words and hedging ("I think", "probably", "it seems")
- 1-sentence explanations max, then code/action
- No repeating what the user said
<!-- /lean-ctx-compression -->
<!-- /lean-ctx-rules -->

# AI Agent Rules

## Running Tests
NEVER run `npm test 2>&1 | tail -40` or pipe `npm test` / `jest` output directly to `tail`. 
Piping to `tail` buffers the entire output until EOF. This means AI agents will not receive any incremental log output, and if the tests hang (e.g., due to open handles), the agent will sit indefinitely without receiving any error or timeout clues. 

**What to do instead:**
- Run the test directly: `npm test` (if output is short enough).
- If the output is extremely long, redirect output to a file and read it later: `npm test > test-output.log 2>&1`, then view `test-output.log`.
- Run specific test files instead of the entire suite to keep output short and relevant.

<!-- Source: superpowers-bridge/templates/adopters/CLAUDE.md.fragment.md -->
<!-- Drop this section into your project's CLAUDE.md so Claude routes future work using this schema correctly. -->
<!-- Adjust the schema name and bridge repo URL if you customized them; otherwise keep as-is. -->

## Workflow routing (read on session start)

This repo uses [`superpowers-bridge`](https://github.com/JiangWay/openspec-schemas/tree/main/superpowers-bridge) to bridge OpenSpec and Superpowers. Integration rules (language, artifact paths, PRECHECK) follow that bridge's README; this section is the routing guidance for Claude.

### Entry routing

| Trigger you observe | What to do |
|---|---|
| User starts a narrative "design discussion / let's brainstorm" | Run verbal `superpowers:brainstorming`, but **do NOT** write to `docs/superpowers/specs/`. Once the conversation converges per the 5 criteria below, promote to `/opsx:propose` |
| User invokes `/opsx:new` / `/opsx:ff` / `/opsx:propose` directly | Follow the schema's flow; artifact instructions inject at each step |
| User explicitly says bug fix / typo / config tweak / doc update | Direct PR — **do NOT** open a change (see skip rules below) |
| User is mid-change | Advance with `/opsx:continue`, `/opsx:apply`, `/opsx:verify`, or `/opsx:archive` |

### When NOT to use opsx (direct PR)

| Scenario | Direct PR? |
|---|---|
| New feature / new capability / architectural change / breaking change | ❌ Use opsx |
| Bug fix (no contract change) / test backfill / linter tweak / non-breaking upgrade / typo / docs / config value tweak | ✅ Direct PR |

Principle: **process ceremony scales with risk**. External contracts / schema / cross-system integration / compliance → opsx. Otherwise → direct PR.

### Verbal brainstorm → opsx promotion criteria

All 5 must hold before promoting (any missing → keep brainstorming, **never** write to `docs/superpowers/specs/`):

1. **Scope locked** — one sentence describes what's in / out
2. **Major design forks resolved** — alternatives weighed; remaining TBDs have an owner and impact-scope statement
3. **Cross-system dependencies mapped** — ready / mockable / genuinely unknown — pick one per dep
4. **Acceptance criteria stateable** — concrete pass conditions (e.g., `./mvnw clean verify` passes + N deliverables)
5. **Conversation converging** — recent turns are confirmations, not new alternatives

When all 5 hold → proactively suggest "ready to `/opsx:propose`?" — wait for user ack. Never auto-trigger.

### Front-door anti-patterns (don't do)

- Letting brainstorming write to `docs/superpowers/specs/`
- Letting writing-plans write to `docs/superpowers/plans/`
- Promoting to opsx with unresolved blocking TBDs
- Opening a change for bug fix / typo

Full detail: [superpowers-bridge README §Entry & exit gates](https://github.com/JiangWay/openspec-schemas/blob/main/superpowers-bridge/README.md#entry--exit-gates).

## Build & Dev Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Clean + sync spec + bundle with ncc to `dist/` |
| `npm test` | Run Vitest suite (all `__tests__/**/*.test.ts`) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run lint` | ESLint + knip (dead code check) |
| `npm run lint:markdown` | markdownlint on README + docs |
| `npm run dev` | Run connector locally with spcx + source maps |
| `npm run docs:serve` | Build and serve MkDocs site locally |
| `npm run prettier` | Format all files with Prettier |

**Before committing:** run `npm run lint` (catches type issues, unused code, and style violations).

## Project Structure

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
- `_` prefix on field names indicates **conventionally-private** members
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
